/**
 * Gateways see Installations, not the catalog (POLICY-REQ-10..12): a real
 * StationServer called over HTTP the way an MCP gateway calls it.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEnvelope, type Policy } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';
import {
  FileDocumentStore,
  generateApiKey,
  InMemoryApiKeyStore,
  InMemoryPolicyStore,
  InMemorySecretStore,
  LocalDataStore,
  StationServer,
} from '@agentapps/station';
import { afterEach, describe, expect, it } from 'vitest';

const ADMIN_TOKEN = 'local-admin-token';

function todoApp() {
  const app = createApp({ id: 'app.todo-list', version: '1.0.0', name: 'Todo' });
  app.tool('get-note', {
    description: 'Read a note',
    parameters: { type: 'object', properties: { id: { type: 'string' } } },
    handler: async (args, ctx) => ctx.storage.collection('notes').get(String(args.id)),
  });
  app.tool('delete-node', {
    description: 'Delete a node',
    parameters: { type: 'object', properties: { nodeId: { type: 'string' } } },
    handler: async () => ({ deleted: true }),
  });
  return app.toFactory();
}

function storageApp() {
  const app = createApp({ id: 'app.storage-test', version: '1.0.0', name: 'Storage' });
  app.tool('ping', {
    description: 'Ping',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ pong: true }),
  });
  return app.toFactory();
}

let server: StationServer | undefined;
let dir: string | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

async function start(opts: { withKey: boolean }) {
  dir = mkdtempSync(join(tmpdir(), 'agentapps-gateway-'));
  // What the CLI wrote earlier for the `todo` Installation.
  await new FileDocumentStore(dir).put('ins_todo', 'notes', 'n1', { text: 'from the CLI' });

  const apiKeys = new InMemoryApiKeyStore();
  const policies = new InMemoryPolicyStore();
  let key = '';
  if (opts.withKey) {
    const { raw, hash, prefix } = generateApiKey();
    const now = new Date().toISOString();
    await apiKeys.create({
      id: 'ak_gw',
      name: 'gateway',
      keyHash: hash,
      prefix,
      identity: { userId: 'pablo' },
      principalId: 'ak_gw',
      createdAt: now,
      updatedAt: now,
    });
    key = raw;
  }
  server = new StationServer({
    stationId: 'stn_test',
    workspaceId: 'ws_test',
    secretStore: new InMemorySecretStore(),
    // The Station's local Data Store on the directory the CLI wrote to.
    dataStore: new LocalDataStore({
      stationId: 'stn_test',
      storageDir: dir,
      dataDir: join(dir, 'data'),
      otherStationsDir: join(dir, 'stations'),
    }),
    publicUrl: 'http://station.test',
    apps: [
      { id: 'app.todo-list', version: '1.0.0', name: 'Todo', factory: todoApp() },
      { id: 'app.storage-test', version: '1.0.0', name: 'Storage', factory: storageApp() },
    ],
    apiKeys,
    policies,
    adminToken: ADMIN_TOKEN,
    installations: () => [
      { installationId: 'ins_todo', alias: 'todo', appId: 'app.todo-list' },
      { installationId: 'ins_storage', alias: 'storage', appId: 'app.storage-test' },
    ],
  });
  const info = await server.start(0, '127.0.0.1');
  return { url: info.url, key, policies };
}

async function setRules(policies: InMemoryPolicyStore, rules: Policy['rules']) {
  const now = new Date().toISOString();
  await policies.put({
    principalId: 'ak_gw',
    approver: 'admin',
    defaultEffect: 'allow',
    rules,
    createdAt: now,
    updatedAt: now,
  });
}

async function installations(url: string, token?: string) {
  const res = await fetch(`${url}/installations`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return {
    status: res.status,
    body: (await res.json()) as { installations?: Array<{ alias: string }> },
  };
}

async function post(url: string, token: string, body: unknown) {
  const res = await fetch(`${url}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

async function open(url: string, token: string, installationId: string): Promise<string> {
  const opened = await post(url, token, {
    ...createEnvelope('session_open'),
    installationId,
    tenant: { userId: 'pablo', workspaceId: 'local' },
  });
  return opened.sessionId as string;
}

async function toolNames(url: string, token: string, sessionId: string): Promise<string[]> {
  const listed = await post(url, token, { ...createEnvelope('list_tools'), sessionId });
  return (listed.tools as Array<{ name: string }>).map((t) => t.name);
}

describe('Gateways and Installations', () => {
  it('[POLICY-AC-11] a key lists only the Installations its Policy allows, and runs as them', async () => {
    const s = await start({ withKey: true });
    await setRules(s.policies, [
      { id: 'no-storage', app: 'app.storage-test', tool: '*', effect: 'deny' },
    ]);

    const asKey = await installations(s.url, s.key);
    expect(asKey.status).toBe(200);
    expect(asKey.body.installations?.map((i) => i.alias)).toEqual(['todo']);
    const asAdmin = await installations(s.url, ADMIN_TOKEN);
    expect(asAdmin.body.installations?.map((i) => i.alias)).toEqual(['todo', 'storage']);

    const sessionId = await open(s.url, s.key, 'ins_todo');
    const result = await post(s.url, s.key, {
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'get-note',
      arguments: { id: 'n1' },
    });
    expect(result.result).toEqual({ text: 'from the CLI' });
  });

  it('[POLICY-AC-12] list_tools omits what the Policy always denies', async () => {
    const s = await start({ withKey: true });
    await setRules(s.policies, [
      { id: 'no-delete', app: 'app.todo-list', tool: 'delete-node', effect: 'deny' },
    ]);
    let sessionId = await open(s.url, s.key, 'ins_todo');
    expect(await toolNames(s.url, s.key, sessionId)).toEqual(['get-note']);

    await setRules(s.policies, [
      { id: 'no-delete', app: 'app.todo-list', tool: 'delete-node', effect: 'deny' },
      {
        id: 'tmp-ok',
        app: 'app.todo-list',
        tool: 'delete-node',
        effect: 'allow',
        when: { nodeId: { startsWith: 'tmp' } },
      },
    ]);
    sessionId = await open(s.url, s.key, 'ins_todo');
    expect(await toolNames(s.url, s.key, sessionId)).toEqual(['get-note', 'delete-node']);
  });

  it('[POLICY-AC-13] an open Station still asks for a credential on /installations', async () => {
    const s = await start({ withKey: false });
    expect((await installations(s.url)).status).toBe(401);
    expect((await installations(s.url, 'aak_not_a_key')).status).toBe(401);
    expect((await installations(s.url, ADMIN_TOKEN)).status).toBe(200);
  });
});
