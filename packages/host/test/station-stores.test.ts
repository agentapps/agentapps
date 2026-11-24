/**
 * A Station answers its Instances' Requests for secrets and data from its
 * Secret Store and its Data Store (SECRETSTORE, DATASTORE).
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createEnvelope } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';
import {
  type DataStore,
  InMemoryDataStore,
  InMemoryInstallationStore,
  InMemorySecretStore,
  type SecretStore,
  StationServer,
  type StationServerOptions,
} from '@agentapps/station';
import { afterEach, describe, expect, it, vi } from 'vitest';

const STATION = 'stn_test';
const WORKSPACE = 'ws_test';
const APP = 'app.probe';
const INSTALLATION = 'ins_probe';
const SYSTEM_SECRET = 'system-secret-value-that-must-not-leak';
const OWN_SECRET = 'installation-secret-value-that-must-not-leak';

const systemScope = { stationId: STATION, appId: APP };
const ownScope = { stationId: STATION, workspaceId: WORKSPACE, installationId: INSTALLATION };

const noArgs = { type: 'object', properties: {} } as const;
const text = { type: 'object', properties: { value: { type: 'string' } } } as const;

/** An App with one tool per kind of Request an Instance makes. */
function probeApp(tokenUrl: string) {
  const app = createApp({
    id: APP,
    version: '1.0.0',
    name: 'Probe',
    auth: {
      type: 'oauth2',
      provider: 'google',
      authorizeUrl: 'https://accounts.example.com/authorize',
      tokenUrl,
      scopes: ['email'],
    },
  });
  app.tool('read-secrets', {
    description: 'Reads the secrets and answers how long each is',
    parameters: noArgs,
    handler: async (_args, ctx) => {
      const system = (await ctx.secrets.getSystem()) ?? {};
      const own = (await ctx.secrets.getInstallation()) ?? {};
      return {
        system: Object.fromEntries(Object.entries(system).map(([k, v]) => [k, v.length])),
        own: Object.fromEntries(Object.entries(own).map(([k, v]) => [k, v.length])),
      };
    },
  });
  app.tool('access-token', {
    description: 'Answers the access token the Installation holds',
    parameters: noArgs,
    handler: async (_args, ctx) => ({
      token: (await ctx.secrets.getInstallation())?.ACCESS_TOKEN,
    }),
  });
  app.tool('refresh', {
    description: 'Asks for a new access token',
    parameters: noArgs,
    handler: async (_args, ctx) => ctx.auth.refresh(),
  });
  app.tool('auth-status', {
    description: 'Asks whether the Installation is signed in',
    parameters: noArgs,
    handler: async (_args, ctx) => ctx.auth.getStatus(),
  });
  app.tool('note-put', {
    description: 'Writes a note',
    parameters: text,
    handler: async (args, ctx) => {
      await ctx.storage.collection('notes').put('n1', { text: String(args.value) });
      return ctx.storage.collection('notes').get('n1');
    },
  });
  app.tool('object-put', {
    description: 'Keeps an Object',
    parameters: {
      type: 'object',
      properties: { value: { type: 'string' }, visibility: { type: 'string' } },
    },
    handler: async (args, ctx) => {
      const info = await ctx.objects.put(String(args.value), {
        contentType: 'text/plain',
        visibility: args.visibility === 'public' ? 'public' : 'private',
      });
      const link = await ctx.objects.link(info.objectId, { expiresIn: 60 });
      return { objectId: info.objectId, url: info.url, link: link.url };
    },
  });
  app.tool('file-write', {
    description: 'Writes a Volume file and reads it back',
    parameters: text,
    handler: async (args, ctx) => {
      await ctx.volume.writeFile('probe.txt', Buffer.from(String(args.value)));
      const read = await ctx.volume.readFile('probe.txt');
      return { read: read ? Buffer.from(read).toString() : null };
    },
  });
  return app.toFactory();
}

/** A store that records the name and the first argument of every call made to it. */
function recording<T extends object>(store: T, calls: Array<[string, unknown]>, prefix = ''): T {
  return new Proxy(store, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          calls.push([`${prefix}${String(property)}`, args[0]]);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      if (value && typeof value === 'object') {
        return recording(value as object, calls, `${prefix}${String(property)}.`);
      }
      return value;
    },
  });
}

describe('a Station and its stores', () => {
  const servers: StationServer[] = [];
  let tokenEndpoint: Server | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const server of servers.splice(0)) await server.stop();
    await new Promise<void>((done) => (tokenEndpoint ? tokenEndpoint.close(() => done()) : done()));
    tokenEndpoint = undefined;
  });

  /** A token endpoint that answers every exchange and refresh with `fresh-token`. */
  async function startTokenEndpoint(): Promise<string> {
    tokenEndpoint = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ access_token: 'fresh-token', refresh_token: 'rt-2', expires_in: 3600 }),
        );
      });
    });
    await new Promise<void>((done) => tokenEndpoint?.listen(0, '127.0.0.1', done));
    return `http://127.0.0.1:${(tokenEndpoint.address() as AddressInfo).port}/token`;
  }

  async function seeded(): Promise<InMemorySecretStore> {
    const store = new InMemorySecretStore();
    await store.setSystemSecrets(systemScope, {
      CLIENT_ID: 'client-id',
      CLIENT_SECRET: SYSTEM_SECRET,
    });
    await store.setInstallationSecrets(ownScope, { ACCESS_TOKEN: OWN_SECRET });
    return store;
  }

  async function start(
    secretStore: SecretStore,
    dataStore: DataStore,
    options: Partial<StationServerOptions> = {},
  ): Promise<string> {
    const tokenUrl =
      (options as { tokenUrl?: string }).tokenUrl ?? 'https://accounts.example.com/token';
    const auth = {
      type: 'oauth2',
      provider: 'google',
      authorizeUrl: 'https://accounts.example.com/authorize',
      tokenUrl,
      scopes: ['email'],
    };
    const server = new StationServer({
      stationId: STATION,
      workspaceId: WORKSPACE,
      publicUrl: 'http://station.test',
      secretStore,
      dataStore,
      apps: [{ id: APP, version: '1.0.0', name: 'Probe', factory: probeApp(tokenUrl), auth }],
      installations: new InMemoryInstallationStore([
        {
          installationId: INSTALLATION,
          alias: 'probe',
          appId: APP,
          permissions: { volume: true },
        },
      ]),
      ...options,
    });
    servers.push(server);
    return (await server.start(0, '127.0.0.1')).url;
  }

  const responses: string[] = [];
  async function post(
    url: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${url}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    responses.push(raw);
    return JSON.parse(raw) as Record<string, unknown>;
  }

  async function open(url: string): Promise<string> {
    const opened = await post(url, {
      ...createEnvelope('session_open'),
      installationId: INSTALLATION,
      tenant: { userId: 'pablo', workspaceId: 'somewhere-else' },
    });
    expect(opened.sessionId, JSON.stringify(opened)).toBeTypeOf('string');
    return opened.sessionId as string;
  }

  async function call(
    url: string,
    sessionId: string,
    tool: string,
    args: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const answer = await post(url, {
      ...createEnvelope('tool_call'),
      sessionId,
      tool,
      arguments: args,
    });
    expect(answer.type, JSON.stringify(answer)).toBe('tool_result');
    return answer.result as Record<string, unknown>;
  }

  it('[SECRETSTORE-AC-1] an Instance’s secrets come from the Secret Store, named by Station, Workspace and Installation', async () => {
    const calls: Array<[string, unknown]> = [];
    const url = await start(recording(await seeded(), calls), new InMemoryDataStore());
    const sessionId = await open(url);

    expect(await call(url, sessionId, 'read-secrets')).toEqual({
      system: { CLIENT_ID: 9, CLIENT_SECRET: SYSTEM_SECRET.length },
      own: { ACCESS_TOKEN: OWN_SECRET.length },
    });
    expect(calls).toContainEqual(['getSystemSecrets', systemScope]);
    // The Workspace is the Installation's, not the one the caller named.
    expect(calls).toContainEqual(['getInstallationSecrets', ownScope]);
  });

  it('[SECRETSTORE-AC-3] [DATASTORE-AC-3] [STADMIN-AC-14] a Station is not created without its stores and its ids', () => {
    const all = {
      stationId: STATION,
      workspaceId: WORKSPACE,
      publicUrl: 'http://station.test',
      secretStore: new InMemorySecretStore(),
      dataStore: new InMemoryDataStore(),
    };
    const without = (key: keyof typeof all) =>
      new StationServer({ ...all, [key]: undefined } as unknown as StationServerOptions);
    expect(() => without('secretStore')).toThrow(/Secret Store/);
    expect(() => without('dataStore')).toThrow(/Data Store/);
    expect(() => without('stationId')).toThrow(/needs an id/);
    expect(() => without('workspaceId')).toThrow(/Workspace's id/);
    expect(() => new StationServer(all)).not.toThrow();
  });

  it('[SECRETSTORE-AC-4] the tokens of an OAuth exchange and of a refresh are kept in the Secret Store', async () => {
    const tokenUrl = await startTokenEndpoint();
    const secrets = await seeded();
    const url = await start(secrets, new InMemoryDataStore(), { tokenUrl } as never);

    // The exchange.
    await secrets.removeInstallationSecrets(ownScope, ['ACCESS_TOKEN']);
    const started = (await (
      await fetch(`${url}/auth/start?installationId=${INSTALLATION}&workspaceId=elsewhere`)
    ).json()) as { state: string };
    const callback = await fetch(`${url}/auth/callback?code=the-code&state=${started.state}`);
    expect(callback.status).toBe(200);
    const exchanged = await secrets.getInstallationSecrets(ownScope);
    expect(exchanged.ACCESS_TOKEN).toBe('fresh-token');
    expect(exchanged.REFRESH_TOKEN).toBe('rt-2');

    // A refresh the Instance asks for.
    await secrets.setInstallationSecrets(ownScope, { ACCESS_TOKEN: 'stale' });
    const sessionId = await open(url);
    expect(await call(url, sessionId, 'refresh')).toMatchObject({ accessToken: 'fresh-token' });
    expect((await secrets.getInstallationSecrets(ownScope)).ACCESS_TOKEN).toBe('fresh-token');

    // A token about to expire is refreshed when the Instance reads its secrets.
    await secrets.setInstallationSecrets(ownScope, {
      ACCESS_TOKEN: 'expired',
      EXPIRY_DATE: new Date(Date.now() - 1000).toISOString(),
    });
    expect(await call(url, sessionId, 'access-token')).toEqual({ token: 'fresh-token' });
    const stored = await secrets.getInstallationSecrets(ownScope);
    expect(Date.parse(stored.EXPIRY_DATE as string)).toBeGreaterThan(Date.now());
    expect(await call(url, sessionId, 'auth-status')).toMatchObject({ authenticated: true });
  });

  it('[SECRETSTORE-AC-6] a link signed by a Station is accepted by its replacement, and by no other Station', async () => {
    const secrets = await seeded();
    const data = new InMemoryDataStore();
    const first = await start(secrets, data);
    const made = await call(first, await open(first), 'object-put', { value: 'private bytes' });
    const linkPath = new URL(made.link as string).pathname + new URL(made.link as string).search;
    expect((await fetch(`${first}${linkPath}`)).status).toBe(200);
    await servers.splice(0)[0]?.stop();

    // The same id on the same stores: the link still works.
    const replacement = await start(secrets, data);
    const served = await fetch(`${replacement}${linkPath}`);
    expect(served.status).toBe(200);
    expect(await served.text()).toBe('private bytes');

    // Another Station on the same stores does not accept it.
    const other = await start(secrets, data, { stationId: 'stn_other' });
    expect((await fetch(`${other}${linkPath}`)).status).not.toBe(200);
  });

  it('[SECRETSTORE-AC-8] no secret reaches the log or an answer other than the one to the Instance', async () => {
    const logged: string[] = [];
    for (const method of ['log', 'error', 'warn', 'info'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }
    responses.length = 0;
    const url = await start(await seeded(), new InMemoryDataStore(), { adminToken: 'admin' });
    const sessionId = await open(url);
    await call(url, sessionId, 'read-secrets');
    for (const path of [`/api/apps/${APP}/secrets`, '/api/apps', '/api/installations', '/health']) {
      responses.push(await (await fetch(`${url}${path}`)).text());
    }

    const everything = [...logged, ...responses].join('\n');
    expect(everything).toContain('CLIENT_SECRET');
    expect(everything).not.toContain(SYSTEM_SECRET);
    expect(everything).not.toContain(OWN_SECRET);
  });

  it('[DATASTORE-AC-1] documents, Objects and Volume files go through the Data Store, and nowhere else', async () => {
    const calls: Array<[string, unknown]> = [];
    const url = await start(await seeded(), recording(new InMemoryDataStore(), calls));
    const sessionId = await open(url);

    expect(await call(url, sessionId, 'note-put', { value: 'a note' })).toEqual({ text: 'a note' });
    await call(url, sessionId, 'object-put', { value: 'an object' });
    expect(await call(url, sessionId, 'file-write', { value: 'a file' })).toEqual({
      read: 'a file',
    });

    const scope = { stationId: STATION, workspaceId: WORKSPACE, installationId: INSTALLATION };
    expect(calls).toContainEqual(['documents.put', scope]);
    expect(calls).toContainEqual(['documents.get', scope]);
    expect(calls).toContainEqual(['objects.put', scope]);
    // The Volume is the Workspace's: it takes no Station.
    expect(calls).toContainEqual(['volume.writeFile', WORKSPACE]);
    expect(calls).toContainEqual(['volume.readFile', WORKSPACE]);
  });

  it('[DATASTORE-AC-4] [SECRETSTORE-AC-4] no Request for secrets or data is passed on to the caller', async () => {
    responses.length = 0;
    const url = await start(await seeded(), new InMemoryDataStore());
    const sessionId = await open(url);
    await call(url, sessionId, 'read-secrets');
    await call(url, sessionId, 'note-put', { value: 'a note' });
    await call(url, sessionId, 'file-write', { value: 'a file' });

    // The caller, which is the Host here, got one answer per message it sent and nothing else.
    const types = responses.map((raw) => (JSON.parse(raw) as { type: string }).type);
    expect(types).toEqual(['session_opened', 'tool_result', 'tool_result', 'tool_result']);
    for (const raw of responses) {
      expect(raw).not.toMatch(/get_system_secrets|get_installation_secrets|storage_|file_volume_/);
    }
  });

  it('[DATASTORE-AC-5] a private Object is served only with a valid link, a public one to anyone', async () => {
    const url = await start(await seeded(), new InMemoryDataStore());
    const sessionId = await open(url);
    const path = (link: unknown): string => {
      const parsed = new URL(link as string);
      return parsed.pathname + parsed.search;
    };

    const priv = await call(url, sessionId, 'object-put', { value: 'private bytes' });
    expect((await fetch(`${url}/objects/${priv.objectId}`)).status).toBe(401);
    expect((await fetch(`${url}/objects/${priv.objectId}?token=garbage`)).status).toBe(401);
    const withLink = await fetch(`${url}${path(priv.link)}`);
    expect(withLink.status).toBe(200);
    expect(await withLink.text()).toBe('private bytes');

    const pub = await call(url, sessionId, 'object-put', {
      value: 'public bytes',
      visibility: 'public',
    });
    const anyone = await fetch(`${url}/objects/${pub.objectId}`);
    expect(anyone.status).toBe(200);
    expect(await anyone.text()).toBe('public bytes');
  });

  it('[DATASTORE-AC-7] with no directory to mount, an App in mount mode does not start, and API mode still works', async () => {
    const mounting = createApp({ id: 'app.mounting', version: '1.0.0', name: 'Mounting' });
    mounting.tool('noop', {
      description: 'Nothing',
      parameters: noArgs,
      handler: async () => ({}),
    });
    const url = await start(await seeded(), new InMemoryDataStore(), {
      apps: [
        { id: APP, version: '1.0.0', factory: probeApp('https://accounts.example.com/token') },
        {
          id: 'app.mounting',
          version: '1.0.0',
          factory: mounting.toFactory(),
          manifest: { id: 'app.mounting', runtime: { mountVolume: true } },
        },
      ],
      installations: new InMemoryInstallationStore([
        { installationId: INSTALLATION, alias: 'probe', appId: APP, permissions: { volume: true } },
        {
          installationId: 'ins_mounting',
          alias: 'mounting',
          appId: 'app.mounting',
          permissions: { volume: true },
        },
      ]),
    });

    const refused = await post(url, {
      ...createEnvelope('session_open'),
      installationId: 'ins_mounting',
      tenant: { userId: 'pablo' },
    });
    expect(refused.sessionId).toBeUndefined();
    expect(JSON.stringify(refused)).toMatch(/[Mm]ount mode/);

    expect(await call(url, await open(url), 'file-write', { value: 'api' })).toEqual({
      read: 'api',
    });
  });
});
