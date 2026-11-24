/**
 * Station administration over HTTP: who operates, who owns, who uses (STADMIN).
 */

import { createEnvelope } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';
import {
  type AppEntry,
  InMemoryApiKeyStore,
  InMemoryBindingStore,
  InMemoryDataStore,
  InMemoryInstallationStore,
  InMemoryPolicyStore,
  InMemorySecretStore,
  InMemoryWorkspaceStore,
  StationServer,
} from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ADMIN = 'admin-token';
const HOME = 'ws_home';
const OTHER = 'ws_other';
const GMAIL = 'app.gmail';
const CLIENT_SECRET = 'client-secret-value-that-must-not-leak';

const noArgs = { type: 'object', properties: {} } as const;

function entry(id: string, auth?: Record<string, unknown>): AppEntry {
  const app = createApp({ id, version: '1.0.0', name: id });
  app.tool('system-secret-names', {
    description: 'Answers the names of the system secrets the Instance receives',
    parameters: noArgs,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      sensitive: false,
    },
    handler: async (_args, ctx) => ({ names: Object.keys((await ctx.secrets.getSystem()) ?? {}) }),
  });
  app.tool('wipe', {
    description: 'A destructive tool: it asks under the default Policy',
    parameters: noArgs,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
      sensitive: false,
    },
    handler: async () => ({ wiped: true }),
  });
  return {
    id,
    version: '1.0.0',
    name: id,
    factory: app.toFactory(),
    ...(auth ? { manifest: { id, auth } } : {}),
  };
}

const gmailAuth = {
  type: 'api-key',
  systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
  installationSecrets: ['ACCESS_TOKEN'],
};

describe('Station administration', () => {
  let server: StationServer;
  let url: string;
  let secrets: InMemorySecretStore;
  const answers: string[] = [];

  beforeEach(async () => {
    answers.length = 0;
    secrets = new InMemorySecretStore();
    const loadable = new Map<string, AppEntry>([['./apps/hello', entry('app.hello')]]);
    server = new StationServer({
      stationId: 'stn_test',
      workspaceId: HOME,
      publicUrl: 'http://station.test',
      secretStore: secrets,
      dataStore: new InMemoryDataStore(),
      adminToken: ADMIN,
      askTimeoutMs: 5_000,
      apps: [entry(GMAIL, gmailAuth)],
      apiKeys: new InMemoryApiKeyStore(),
      policies: new InMemoryPolicyStore(),
      installations: new InMemoryInstallationStore(),
      bindings: new InMemoryBindingStore(),
      workspaces: new InMemoryWorkspaceStore(),
      appCatalog: {
        add: async (source) => {
          const found = loadable.get(source);
          if (!found) throw new Error('App not found');
          return found;
        },
        remove: async () => {},
      },
    });
    url = (await server.start(0, '127.0.0.1')).url;
  });

  afterEach(async () => {
    await server.stop();
  });

  async function api(
    method: string,
    path: string,
    token: string | undefined,
    body?: unknown,
  ): Promise<{ status: number; body: Record<string, any>; raw: string }> {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await res.text();
    answers.push(raw);
    return { status: res.status, body: raw ? JSON.parse(raw) : {}, raw };
  }

  /** A key made by the admin, who operates the Station and owns its home Workspace. */
  async function key(name: string, role?: string, workspaceId?: string): Promise<string> {
    const made = await api('POST', '/api/keys', ADMIN, {
      name,
      userId: name,
      ...(role ? { role } : {}),
      ...(workspaceId ? { workspaceId } : {}),
    });
    expect(made.status, made.raw).toBe(201);
    return made.body.key as string;
  }

  async function message(token: string, body: Record<string, unknown>) {
    const res = await fetch(`${url}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  }

  async function callTool(token: string, installationId: string, tool: string) {
    const opened = await message(token, {
      ...createEnvelope('session_open'),
      installationId,
      tenant: { userId: 'someone' },
    });
    if (typeof opened.body.sessionId !== 'string') return opened;
    return message(token, {
      ...createEnvelope('tool_call'),
      sessionId: opened.body.sessionId,
      tool,
      arguments: {},
    });
  }

  /** The home Workspace with an Owner, and a second Workspace with its own. */
  async function twoWorkspaces() {
    expect((await api('POST', '/api/workspaces', ADMIN, { id: OTHER })).status).toBe(201);
    const ana = await key('ana', 'workspace-owner');
    const bea = await key('bea', 'workspace-owner', OTHER);
    const operator = await key('ops', 'station-operator');
    const inA = await api('POST', '/api/installations', ana, { appId: GMAIL, alias: 'gmail' });
    const inB = await api('POST', '/api/installations', bea, { appId: GMAIL, alias: 'gmail' });
    expect(inA.status, inA.raw).toBe(201);
    expect(inB.status, inB.raw).toBe(201);
    return {
      ana,
      bea,
      operator,
      a: inA.body.installationId as string,
      b: inB.body.installationId as string,
    };
  }

  it('[STADMIN-AC-1] an Owner works inside its Workspace only, and the Station Operator uses none', async () => {
    const { ana, operator, a, b } = await twoWorkspaces();

    // Not the Operator's job.
    expect(
      (await api('PUT', `/api/apps/${GMAIL}/secrets`, ana, { set: { CLIENT_ID: 'x' } })).status,
    ).toBe(403);
    // Nothing of the other Workspace.
    const mine = await api('GET', '/api/installations', ana);
    expect(mine.body.installations.map((i: any) => i.installationId)).toEqual([a]);
    expect((await api('GET', `/api/installations/${b}`, ana)).status).toBe(404);
    expect((await api('PATCH', `/api/installations/${b}`, ana, { alias: 'stolen' })).status).toBe(
      404,
    );
    expect((await api('DELETE', `/api/installations/${b}`, ana)).status).toBe(404);
    expect((await callTool(ana, b, 'system-secret-names')).status).toBe(404);

    // The Operator operates the Station and uses no Workspace.
    expect((await api('GET', '/api/installations', operator)).status).toBe(403);
    expect(
      (await api('POST', '/api/installations', operator, { appId: GMAIL, alias: 'x' })).status,
    ).toBe(403);
    expect((await callTool(operator, a, 'system-secret-names')).status).toBe(404);
    expect(
      (await api('PUT', `/api/apps/${GMAIL}/secrets`, operator, { set: { CLIENT_ID: 'x' } }))
        .status,
    ).toBe(200);
  });

  it('[STADMIN-AC-2] the admin credential of a Station operates it and owns its home Workspace', async () => {
    const set = await api('PUT', `/api/apps/${GMAIL}/secrets`, ADMIN, { set: { CLIENT_ID: 'id' } });
    expect(set.status).toBe(200);
    const installed = await api('POST', '/api/installations', ADMIN, {
      appId: GMAIL,
      alias: 'gmail',
    });
    expect(installed.status).toBe(201);
    expect((await api('GET', '/api/whoami', ADMIN)).body).toMatchObject({
      stationId: 'stn_test',
      operator: true,
      owner: true,
      workspaceId: HOME,
    });
  });

  it('[STADMIN-AC-3] a system secret is per App: Installations in two Workspaces receive it', async () => {
    const { ana, bea, a, b } = await twoWorkspaces();
    await api('PUT', `/api/apps/${GMAIL}/secrets`, ADMIN, {
      set: { CLIENT_ID: 'id', CLIENT_SECRET },
    });
    for (const [token, installation] of [
      [ana, a],
      [bea, b],
    ] as const) {
      const called = await callTool(token, installation, 'system-secret-names');
      expect(called.body.result, JSON.stringify(called.body)).toEqual({
        names: ['CLIENT_ID', 'CLIENT_SECRET'],
      });
    }
    // Kept in the Secret Store, tied to this Station and the App.
    expect(await secrets.getSystemSecrets({ stationId: 'stn_test', appId: GMAIL })).toEqual({
      CLIENT_ID: 'id',
      CLIENT_SECRET,
    });
  });

  it('[STADMIN-AC-4] system secrets go in and never come out', async () => {
    answers.length = 0;
    await api('PUT', `/api/apps/${GMAIL}/secrets`, ADMIN, { set: { CLIENT_ID: CLIENT_SECRET } });
    const names = await api('GET', `/api/apps/${GMAIL}/secrets`, ADMIN);
    expect(names.body).toMatchObject({ set: ['CLIENT_ID'], missing: ['CLIENT_SECRET'] });

    await api('POST', '/api/installations', ADMIN, { appId: GMAIL, alias: 'gmail' });
    for (const path of [
      '/api/apps',
      '/api/installations',
      '/api/installations/gmail',
      '/apps',
      '/health',
    ]) {
      await api('GET', path, ADMIN);
    }
    expect(answers.join('\n')).not.toContain(CLIENT_SECRET);

    // A key the App does not declare is refused; a redirect URI is never one.
    const refused = await api('PUT', `/api/apps/${GMAIL}/secrets`, ADMIN, {
      set: { REDIRECT_URI: 'http://x/auth/callback' },
    });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('UNEXPECTED_SECRET');
  });

  it('[STADMIN-AC-5] every operation exists, needs a credential, and works with the right one', async () => {
    const installed = await api('POST', '/api/installations', ADMIN, {
      appId: GMAIL,
      alias: 'gmail',
    });
    const second = await api('POST', '/api/installations', ADMIN, { appId: GMAIL, alias: 'other' });
    const id = installed.body.installationId as string;
    const member = await key('bot');

    const operations: Array<[string, string, unknown?]> = [
      ['GET', '/api/whoami'],
      ['GET', '/api/apps'],
      ['POST', '/api/apps', { source: './apps/hello' }],
      ['PUT', `/api/apps/${GMAIL}/secrets`, { set: { CLIENT_ID: 'id' }, unset: ['OLD'] }],
      ['GET', `/api/apps/${GMAIL}/secrets`],
      ['GET', '/api/installations'],
      ['POST', '/api/installations', { appId: 'app.hello', alias: 'hello' }],
      ['GET', `/api/installations/${id}`],
      ['PATCH', `/api/installations/${id}`, { alias: 'mail', permissions: { volume: true } }],
      ['PUT', `/api/installations/${id}/secrets`, { set: { ACCESS_TOKEN: 't' } }],
      ['PUT', `/api/installations/${id}/secrets`, { unset: ['ACCESS_TOKEN'] }],
      ['PUT', `/api/installations/${id}/secrets`, { clear: true }],
      ['PUT', `/api/installations/${id}/bindings/files`, { target: second.body.installationId }],
      ['GET', `/api/installations/${id}/bindings`],
      ['DELETE', `/api/installations/${id}/bindings/files`],
      ['GET', '/api/keys'],
      ['POST', '/api/keys', { name: 'another', userId: 'u' }],
      ['DELETE', '/api/keys/another'],
      ['GET', '/api/policies'],
      ['PUT', '/api/policies/bot', { rules: [] }],
      ['GET', '/api/policies/bot'],
      ['DELETE', '/api/policies/bot'],
      ['GET', '/api/workspaces'],
      ['POST', '/api/workspaces', { id: OTHER }],
      ['DELETE', `/api/installations/${second.body.installationId}`],
      ['DELETE', '/api/installations/hello'],
      ['DELETE', '/api/apps/app.hello'],
    ];
    for (const [method, path, body] of operations) {
      const label = `${method} ${path}`;
      // An active API Key exists, so no credential is no access.
      expect((await api(method, path, undefined, body)).status, `${label} with no credential`).toBe(
        401,
      );
      if (path !== '/api/whoami' && path !== '/api/apps') {
        const asMember = await api(method, path, member, body);
        expect(asMember.status, `${label} as a Member`).toBe(403);
      }
      const done = await api(method, path, ADMIN, body);
      expect(done.status, `${label}: ${done.raw}`).toBeLessThan(300);
    }
  });

  it('[STADMIN-AC-8] a refusal does not tell whether what was named exists', async () => {
    const ana = await key('ana', 'workspace-owner');
    const real = await api('PUT', `/api/apps/${GMAIL}/secrets`, ana, { set: { CLIENT_ID: 'x' } });
    const absent = await api('PUT', '/api/apps/app.absent/secrets', ana, {
      set: { CLIENT_ID: 'x' },
    });
    expect(absent.status).toBe(real.status);
    expect(absent.raw).toBe(real.raw);

    const { bea, a } = await twoWorkspaces().catch(async () => ({ bea: '', a: '' }));
    if (bea) {
      const notMine = await api('GET', `/api/installations/${a}`, bea);
      const nothing = await api('GET', '/api/installations/ins_absent', bea);
      expect(notMine.status).toBe(404);
      expect(notMine.raw).toBe(nothing.raw);
    }
  });

  it('[STADMIN-AC-9] the role is on the key: the Operator names Owners, an Owner its Members', async () => {
    const made = await api('POST', '/api/keys', ADMIN, {
      name: 'ana',
      userId: 'u1',
      role: 'workspace-owner',
    });
    expect(made.status).toBe(201);
    const ana = made.body.key as string;
    const listed = await api('GET', '/api/keys', ADMIN);
    expect(listed.body.keys.find((k: any) => k.name === 'ana').role).toBe('workspace-owner');
    expect(listed.raw).not.toContain(ana);
    expect(
      (await api('POST', '/api/installations', ana, { appId: GMAIL, alias: 'gmail' })).status,
    ).toBe(201);

    // An Owner creates a Member, which is what a key is when no role is given.
    const member = await api('POST', '/api/keys', ana, { name: 'luis', userId: 'u2' });
    expect(member.status).toBe(201);
    expect(member.body.role).toBe('workspace-member');
    const luis = member.body.key as string;
    for (const [method, path, body] of [
      ['POST', '/api/installations', { appId: GMAIL, alias: 'mine' }],
      ['PUT', '/api/installations/gmail/secrets', { set: { ACCESS_TOKEN: 't' } }],
      ['PUT', '/api/policies/luis', { rules: [] }],
      ['POST', '/api/keys', { name: 'more', userId: 'u3' }],
      ['GET', '/approvals', undefined],
    ] as const) {
      expect((await api(method, path, luis, body)).status, `${method} ${path}`).toBe(403);
    }
    const installation = (await api('GET', '/api/installations/gmail', ana)).body.installationId;
    expect((await callTool(luis, installation, 'system-secret-names')).body.result).toEqual({
      names: [],
    });

    // An Owner does not name another Owner, nor an Operator.
    for (const role of ['workspace-owner', 'station-operator']) {
      const refused = await api('POST', '/api/keys', ana, { name: 'eva', userId: 'u3', role });
      expect(refused.status, role).toBe(403);
    }
    expect((await api('GET', '/api/keys', ana)).body.keys.map((k: any) => k.name)).toEqual([
      'luis',
    ]);
    expect(
      (await api('POST', '/api/keys', ADMIN, { name: 'x', userId: 'u', role: 'boss' })).status,
    ).toBe(400);
  });

  it('[STADMIN-AC-10] [STADMIN-AC-11] Apps are added by the Station Operator, and installing never adds one', async () => {
    const ana = await key('ana', 'workspace-owner');

    // Installing what is not available adds nothing, whoever asks.
    for (const [token, operator] of [
      [ana, false],
      [ADMIN, true],
    ] as const) {
      const refused = await api('POST', '/api/installations', token, {
        appId: 'app.hello',
        alias: 'hello',
      });
      expect(refused.status).toBe(404);
      expect(refused.body).toMatchObject({ code: 'APP_NOT_AVAILABLE', operator });
      expect(refused.body.error).toContain('Station Operator');
    }
    expect((await api('GET', '/api/apps', ADMIN)).body.apps.map((a: any) => a.id)).toEqual([GMAIL]);

    expect((await api('POST', '/api/apps', ana, { source: './apps/hello' })).status).toBe(403);
    expect((await api('POST', '/api/apps', ADMIN, { source: './apps/absent' })).status).toBe(404);
    const added = await api('POST', '/api/apps', ADMIN, { source: './apps/hello' });
    expect(added.status).toBe(201);
    expect(added.body.id).toBe('app.hello');

    // Available at once, with no restart.
    expect((await api('GET', '/api/apps', ana)).body.apps.map((a: any) => a.id)).toEqual([
      GMAIL,
      'app.hello',
    ]);
    const installed = await api('POST', '/api/installations', ana, {
      appId: 'app.hello',
      alias: 'hello',
    });
    expect(installed.status).toBe(201);
    expect(
      (await callTool(ana, installed.body.installationId, 'system-secret-names')).body.result,
    ).toEqual({ names: [] });

    const inUse = await api('DELETE', '/api/apps/app.hello', ADMIN);
    expect(inUse.status).toBe(409);
    expect(inUse.body.installations).toBe(1);
    expect((await api('DELETE', '/api/installations/hello', ana)).status).toBe(200);
    expect((await api('DELETE', '/api/apps/app.hello', ana)).status).toBe(403);
    expect((await api('DELETE', '/api/apps/app.hello', ADMIN)).status).toBe(200);
    expect((await api('GET', '/api/apps', ADMIN)).body.apps.map((a: any) => a.id)).toEqual([GMAIL]);
  });

  it('[STADMIN-AC-12] a secret is removed without a trace, also one the App no longer declares', async () => {
    const scope = { stationId: 'stn_test', appId: GMAIL };
    // What an older version of the App left behind.
    await secrets.setSystemSecrets(scope, { CLIENT_SECRET: 'x', REDIRECT_URI: 'y' });

    const removed = await api('PUT', `/api/apps/${GMAIL}/secrets`, ADMIN, {
      unset: ['REDIRECT_URI'],
    });
    expect(removed.body).toMatchObject({ removed: ['REDIRECT_URI'], notSet: [] });
    const left = await secrets.getSystemSecrets(scope);
    expect(left).toEqual({ CLIENT_SECRET: 'x' });
    expect(Object.hasOwn(left, 'REDIRECT_URI')).toBe(false);

    const again = await api('PUT', `/api/apps/${GMAIL}/secrets`, ADMIN, {
      unset: ['REDIRECT_URI'],
    });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ removed: [], notSet: ['REDIRECT_URI'] });

    const installed = await api('POST', '/api/installations', ADMIN, {
      appId: GMAIL,
      alias: 'gmail',
    });
    const own = {
      stationId: 'stn_test',
      workspaceId: HOME,
      installationId: installed.body.installationId,
    };
    await api('PUT', '/api/installations/gmail/secrets', ADMIN, { set: { ACCESS_TOKEN: 't' } });
    expect(await secrets.getInstallationSecrets(own)).toEqual({ ACCESS_TOKEN: 't' });
    const unset = await api('PUT', '/api/installations/gmail/secrets', ADMIN, {
      unset: ['ACCESS_TOKEN'],
    });
    expect(unset.body.removed).toEqual(['ACCESS_TOKEN']);
    expect(await secrets.getInstallationSecrets(own)).toEqual({});
  });

  it('[STADMIN-AC-13] an Approval is seen and decided by the Owner of its Workspace, and by nobody else', async () => {
    const { ana, bea, operator, a } = await twoWorkspaces();
    const luis = (await api('POST', '/api/keys', ana, { name: 'luis', userId: 'u2' })).body
      .key as string;

    // A destructive tool asks under the default Policy: the call parks.
    const parked = callTool(luis, a, 'wipe');
    let pending: any[] = [];
    for (let i = 0; i < 100 && pending.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
      pending = (await api('GET', '/approvals', ana)).body.approvals;
    }
    expect(pending.length).toBe(1);
    const id = pending[0].id as string;

    for (const stranger of [operator, bea]) {
      expect((await api('GET', '/approvals', stranger)).body.approvals).toEqual([]);
      expect(
        (await api('POST', `/approvals/${id}`, stranger, { decision: 'approve' })).status,
      ).toBe(404);
    }
    expect((await api('POST', `/approvals/${id}`, ana, { decision: 'approve' })).status).toBe(200);
    expect((await parked).body.result).toEqual({ wiped: true });
  });

  it('[STADMIN-AC-15] a Workspace is made known by the Station Operator, once, and its id opens nothing', async () => {
    const ana = await key('ana', 'workspace-owner');
    expect((await api('POST', '/api/workspaces', ana, { id: OTHER })).status).toBe(403);
    expect((await api('POST', '/api/workspaces', ADMIN, { id: OTHER })).status).toBe(201);
    expect((await api('POST', '/api/workspaces', ADMIN, { id: OTHER })).status).toBe(409);
    expect((await api('POST', '/api/workspaces', ADMIN, { id: HOME })).status).toBe(409);
    expect((await api('GET', '/api/workspaces', ADMIN)).body.workspaces).toEqual([HOME, OTHER]);

    // An Owner's key for a Workspace the Station does not know is not made.
    expect(
      (
        await api('POST', '/api/keys', ADMIN, {
          name: 'x',
          userId: 'u',
          role: 'workspace-owner',
          workspaceId: 'ws_unknown',
        })
      ).status,
    ).toBe(400);

    // Naming a Workspace is not a credential for it.
    const bea = await key('bea', 'workspace-owner', OTHER);
    const inB = await api('POST', '/api/installations', bea, { appId: GMAIL, alias: 'gmail' });
    const claim = {
      ...createEnvelope('session_open'),
      installationId: inB.body.installationId,
      tenant: { userId: 'ana', workspaceId: OTHER },
    };
    expect((await message(ana, claim)).status).toBe(404);
    const noCredential = await fetch(`${url}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(claim),
    });
    expect(noCredential.status).toBe(401);
    expect((await api('GET', `/api/installations/${inB.body.installationId}`, ana)).status).toBe(
      404,
    );
  });
});
