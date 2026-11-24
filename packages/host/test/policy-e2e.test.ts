/**
 * Policies and Approvals end to end (docs/specs/policies.md): a real
 * StationServer in front of an SDK app, called over HTTP as a Principal.
 */

import { createEnvelope, type Policy } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';
import {
  generateApiKey,
  InMemoryApiKeyStore,
  InMemoryDataStore,
  InMemoryPolicyStore,
  InMemorySecretStore,
  StationServer,
} from '@agentapps/station';
import { afterEach, describe, expect, it } from 'vitest';

const ADMIN_TOKEN = 'local-admin-token';

function buildMail() {
  const app = createApp({ id: 'app.mail', version: '1.0.0' });
  const sent: unknown[] = [];
  app.tool('send_email', {
    description: 'Send an email',
    parameters: { type: 'object', properties: { to: { type: 'string' } } },
    handler: async (args) => {
      sent.push(args);
      return { sent: true };
    },
  });
  app.tool('delete_all', {
    description: 'Delete every email',
    annotations: { destructiveHint: true },
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ deleted: true }),
  });
  return { factory: app.toFactory(), sent };
}

interface Running {
  url: string;
  key: string;
  principalId: string;
  policies: InMemoryPolicyStore;
  sent: unknown[];
  logs: string[];
}

let server: StationServer | undefined;
const originalError = console.error;
afterEach(async () => {
  console.error = originalError;
  await server?.stop();
  server = undefined;
});

async function start(options?: { askTimeoutMs?: number }): Promise<Running> {
  const { factory, sent } = buildMail();
  const apiKeys = new InMemoryApiKeyStore();
  const { raw, hash, prefix } = generateApiKey();
  const now = new Date().toISOString();
  await apiKeys.create({
    id: 'ak_marianne',
    name: 'marianne',
    keyHash: hash,
    prefix,
    identity: { userId: 'marianne' },
    principalId: 'ak_marianne',
    createdAt: now,
    updatedAt: now,
  });
  const policies = new InMemoryPolicyStore();
  const logs: string[] = [];
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  server = new StationServer({
    stationId: 'stn_test',
    workspaceId: 'ws_test',
    secretStore: new InMemorySecretStore(),
    dataStore: new InMemoryDataStore(),
    publicUrl: 'http://station.test',
    apps: [{ id: 'app.mail', version: '1.0.0', factory }],
    apiKeys,
    policies,
    adminToken: ADMIN_TOKEN,
    askTimeoutMs: options?.askTimeoutMs,
  });
  const info = await server.start(0, '127.0.0.1');
  return { url: info.url, key: raw, principalId: 'ak_marianne', policies, sent, logs };
}

async function post(url: string, token: string, body: unknown): Promise<Response> {
  return fetch(`${url}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

async function openSession(r: Running): Promise<string> {
  const open = await post(r.url, r.key, {
    ...createEnvelope('session_open'),
    appId: 'app.mail',
    installationId: 'app.mail',
    tenant: { userId: 'marianne' },
  });
  const opened = (await open.json()) as { sessionId: string };
  // Listing tools gives the station the Annotations Rules may refer to.
  await post(r.url, r.key, { ...createEnvelope('list_tools'), sessionId: opened.sessionId });
  return opened.sessionId;
}

function callTool(r: Running, sessionId: string, tool: string, args: Record<string, unknown>) {
  return post(r.url, r.key, {
    ...createEnvelope('tool_call'),
    sessionId,
    tool,
    arguments: args,
  });
}

async function pendingApprovals(r: Running): Promise<Array<{ id: string; tool: string }>> {
  for (let i = 0; i < 200; i++) {
    const res = await fetch(`${r.url}/approvals`, {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const body = (await res.json()) as { approvals: Array<{ id: string; tool: string }> };
    if (body.approvals.length > 0) return body.approvals;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return [];
}

function policyOf(principalId: string, rules: Policy['rules']): Policy {
  const now = new Date().toISOString();
  return {
    principalId,
    approver: 'admin',
    defaultEffect: 'allow',
    rules,
    createdAt: now,
    updatedAt: now,
  };
}

describe('Policies and Approvals over the Station', () => {
  it("[POLICY-AC-1] a call made with an API Key is evaluated against that key's Principal", async () => {
    const r = await start();
    await r.policies.put(
      policyOf('ak_marianne', [{ id: 'no-mail', app: 'app.mail', tool: '*', effect: 'deny' }]),
    );
    // The admin Principal has no such rule.
    await r.policies.put(policyOf('admin', []));
    const sessionId = await openSession(r);
    const res = await callTool(r, sessionId, 'send_email', { to: 'a@b.c' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { details: { rule: string } } };
    expect(body.error.details.rule).toBe('no-mail');
  });

  it('[POLICY-AC-3] argument conditions decide: a matching recipient relays, another one parks', async () => {
    const r = await start({ askTimeoutMs: 200 });
    await r.policies.put(
      policyOf('ak_marianne', [
        {
          id: 'team',
          app: 'app.mail',
          tool: 'send_email',
          effect: 'allow',
          when: { to: { endsWith: '@hexagon.sh' } },
        },
        { id: 'others', app: 'app.mail', tool: 'send_email', effect: 'ask' },
      ]),
    );
    const sessionId = await openSession(r);
    const ok = await callTool(r, sessionId, 'send_email', { to: 'ana@hexagon.sh' });
    expect(ok.status).toBe(200);

    const parked = callTool(r, sessionId, 'send_email', { to: 'pepe@gmail.com' });
    const pending = await pendingApprovals(r);
    expect(pending.map((a) => a.tool)).toEqual(['send_email']);
    expect((await parked).status).toBe(403);
  });

  it('[POLICY-AC-4] a destructive tool asks under the default Policy and is allowed once that Rule is gone', async () => {
    const r = await start({ askTimeoutMs: 100 });
    const sessionId = await openSession(r);
    const asked = await callTool(r, sessionId, 'delete_all', {});
    const body = (await asked.json()) as { error: { code: string; details: { rule: string } } };
    expect(body.error.code).toBe('APPROVAL_TIMEOUT');
    expect(body.error.details.rule).toBe('default-destructive');

    const { defaultPolicy } = await import('@agentapps/station');
    const policy = defaultPolicy('ak_marianne');
    await r.policies.put({
      ...policy,
      rules: policy.rules.filter((rule) => rule.id !== 'default-destructive'),
    });
    expect((await callTool(r, sessionId, 'delete_all', {})).status).toBe(200);
  });

  it('[POLICY-AC-5] a deny Rule answers PERMISSION_DENIED with layer policy and the Rule id, and the app never runs', async () => {
    const r = await start();
    await r.policies.put(
      policyOf('ak_marianne', [
        { id: 'never-mail', app: 'app.mail', tool: 'send_email', effect: 'deny' },
      ]),
    );
    const sessionId = await openSession(r);
    const res = await callTool(r, sessionId, 'send_email', { to: 'x@y.z' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: { code: string; details: { layer: string; rule: string } };
    };
    expect(body.error.code).toBe('PERMISSION_DENIED');
    expect(body.error.details).toMatchObject({ layer: 'policy', rule: 'never-mail' });
    expect(r.sent).toHaveLength(0);
  });

  it('[POLICY-AC-6] a parked call is listed in /approvals, approve lets it complete, and an undecided one times out', async () => {
    const r = await start({ askTimeoutMs: 300 });
    await r.policies.put(
      policyOf('ak_marianne', [
        { id: 'ask-mail', app: 'app.mail', tool: 'send_email', effect: 'ask' },
      ]),
    );
    const sessionId = await openSession(r);

    const parked = callTool(r, sessionId, 'send_email', { to: 'x@y.z' });
    const [approval] = await pendingApprovals(r);
    expect(approval?.tool).toBe('send_email');

    // Only the Approver may answer.
    const byMarianne = await fetch(`${r.url}/approvals/${approval!.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${r.key}` },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(byMarianne.status).toBe(403);

    const decided = await fetch(`${r.url}/approvals/${approval!.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(decided.status).toBe(200);
    expect((await parked).status).toBe(200);
    expect(r.sent).toHaveLength(1);

    const undecided = await callTool(r, sessionId, 'send_email', { to: 'x@y.z' });
    const body = (await undecided.json()) as { error: { code: string } };
    expect(body.error.code).toBe('APPROVAL_TIMEOUT');
  });

  it('[POLICY-AC-10] every deny and every approval decision is logged with Principal, app, tool, Rule and time', async () => {
    const r = await start({ askTimeoutMs: 2000 });
    await r.policies.put(
      policyOf('ak_marianne', [
        { id: 'ask-mail', app: 'app.mail', tool: 'send_email', effect: 'ask' },
        { id: 'no-delete', app: 'app.mail', tool: 'delete_all', effect: 'deny' },
      ]),
    );
    const sessionId = await openSession(r);
    await callTool(r, sessionId, 'delete_all', {});
    const parked = callTool(r, sessionId, 'send_email', { to: 'x@y.z' });
    const [approval] = await pendingApprovals(r);
    await fetch(`${r.url}/approvals/${approval!.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ decision: 'deny' }),
    });
    await parked;

    const denyLine = r.logs.find((l) => l.includes('[policy] deny') && l.includes('delete_all'));
    expect(denyLine).toMatch(
      /principal=ak_marianne app=app\.mail tool=delete_all rule=no-delete at=\d{4}-/,
    );
    const decisionLine = r.logs.find((l) => l.includes(' deny by admin'));
    expect(decisionLine).toMatch(
      /principal=ak_marianne app=app\.mail tool=send_email rule=ask-mail at=\d{4}-/,
    );
  });
});
