/**
 * `agentapps mcp <keyName>` (CLI-REQ-6): a real MCP client talks over stdio to
 * the CLI, which talks to a real station with the stored key.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Policy } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';
import {
  FileDocumentStore,
  generateApiKey,
  InMemoryApiKeyStore,
  InMemoryPolicyStore,
  StationServer,
} from '@agentapps/station';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';
import { saveClientKey } from '../src/secrets-store.js';
import { stationMetaPath } from '../src/station-lifecycle.js';

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '../src/bin.ts');

function todoApp() {
  const app = createApp({ id: 'app.todo-list', version: '1.0.0', name: 'Todo' });
  app.tool('get-tree', {
    description: 'The whole tree',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      // Like the real todo app, it needs to know who is calling.
      if (!ctx.execution.userId) throw new Error('NO_USER_CONTEXT');
      return ctx.storage.collection('nodes').get('root');
    },
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

let dir: string;
let server: StationServer | undefined;
let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  await server?.stop();
  client = undefined;
  server = undefined;
  rmSync(dir, { recursive: true, force: true });
});

/** A workspace whose `claude-code` key is stored, optionally with a running station. */
async function workspace(withStation: boolean): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'agentapps-mcp-'));
  const configPath = join(dir, 'agentapps.json');
  writeFileSync(configPath, '{"apps":[]}\n');

  const { raw, hash, prefix } = generateApiKey();
  saveClientKey(configPath, 'claude-code', { keyId: 'ak_cc', key: raw });
  if (!withStation) return configPath;

  const storage = join(dir, 'storage');
  await new FileDocumentStore(storage).put('ins_todo', 'nodes', 'root', { text: 'Personal' });
  const apiKeys = new InMemoryApiKeyStore();
  const now = new Date().toISOString();
  await apiKeys.create({
    id: 'ak_cc',
    name: 'claude-code',
    keyHash: hash,
    prefix,
    identity: { userId: 'pablo' },
    principalId: 'ak_cc',
    createdAt: now,
    updatedAt: now,
  });
  const policies = new InMemoryPolicyStore();
  const policy: Policy = {
    principalId: 'ak_cc',
    approver: 'admin',
    defaultEffect: 'allow',
    rules: [{ id: 'no-storage', app: 'app.storage-test', tool: '*', effect: 'deny' }],
    createdAt: now,
    updatedAt: now,
  };
  await policies.put(policy);

  server = new StationServer({
    apps: [
      { id: 'app.todo-list', version: '1.0.0', name: 'Todo', factory: todoApp() },
      { id: 'app.storage-test', version: '1.0.0', name: 'Storage', factory: storageApp() },
    ],
    apiKeys,
    policies,
    adminToken: 'admin-token',
    documentStore: new FileDocumentStore(storage),
    installations: () => [
      { installationId: 'ins_todo', alias: 'todo', appId: 'app.todo-list' },
      { installationId: 'ins_storage', alias: 'storage', appId: 'app.storage-test' },
    ],
  });
  const info = await server.start(0, '127.0.0.1');
  mkdirSync(dirname(stationMetaPath(configPath)), { recursive: true });
  writeFileSync(
    stationMetaPath(configPath),
    JSON.stringify({
      pid: process.pid,
      port: info.port,
      url: info.url,
      startedAt: now,
      logPath: '',
    }),
  );
  return configPath;
}

/** Start `agentapps mcp claude-code` as Claude Code would, collecting its stderr. */
async function connectClient(configPath: string): Promise<{ stderr: () => string }> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', BIN, '--config', configPath, 'mcp', 'claude-code'],
    stderr: 'pipe',
    env: { ...(process.env as Record<string, string>) },
  });
  let err = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    err += chunk.toString();
  });
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  return { stderr: () => err };
}

describe('agentapps mcp', () => {
  it('[CLI-AC-6] exposes only the Installations the key may see, and runs their tools', async () => {
    const configPath = await workspace(true);
    await connectClient(configPath);

    const { tools } = await client!.listTools();
    expect(tools.map((t) => t.name)).toEqual(['todo__get-tree']);

    const result = await client!.callTool({ name: 'todo__get-tree', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain('Personal');
  }, 30_000);

  it('[CLI-AC-6] with no station it exposes no tools and says so on stderr', async () => {
    const configPath = await workspace(false);
    const proc = await connectClient(configPath);

    const { tools } = await client!.listTools();
    expect(tools).toEqual([]);
    expect(proc.stderr()).toContain('No station is answering');
  }, 30_000);
});
