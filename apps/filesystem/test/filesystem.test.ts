/**
 * Tests for the Filesystem Agent App.
 *
 * Uses real filesystem operations on a temp directory.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import factory from '../src/app.js';
import { resetDefaultGuard } from '../src/lib/path-safety.js';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let appStation: AppStation;
let host: Transport;
let received: MessageBase[];
let testDir: string;

function collectMessages(transport: Transport): MessageBase[] {
  const msgs: MessageBase[] = [];
  transport.onMessage((msg) => msgs.push(msg));
  return msgs;
}

async function waitFor(
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 5000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = received.find((m) => predicate(m as Record<string, unknown>));
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Timeout waiting for message');
}

async function waitForType(type: string, timeoutMs = 5000): Promise<Record<string, unknown>> {
  return waitFor((m) => m.type === type, timeoutMs);
}

async function initAndOpen(): Promise<string> {
  host.send({
    ...createEnvelope('initialize'),
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'test', version: '2.0.0' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitForType('initialized');

  received.length = 0;
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'inst_fs',
    tenant: { userId: 'u_test' },
  } as MessageBase);
  const opened = await waitForType('session_opened');
  received.length = 0;
  return opened.sessionId as string;
}

function sendToolCall(sessionId: string, tool: string, args: Record<string, unknown>): void {
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool,
    arguments: args,
    context: { userId: 'u_test', installationId: 'inst_fs' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  testDir = mkdtempSync(join(tmpdir(), 'agentapp-fs-test-'));
  process.env.WORKSPACE_PATH = testDir;

  // Create some test files
  writeFileSync(join(testDir, 'hello.txt'), 'Hello, world!\nSecond line.\nThird line.\n');
  writeFileSync(join(testDir, 'data.json'), '{"key": "value"}');
  mkdirSync(join(testDir, 'subdir'));
  writeFileSync(join(testDir, 'subdir', 'nested.ts'), 'export const x = 42;\n');
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  delete process.env.WORKSPACE_PATH;
});

beforeEach(() => {
  // Reset path guard so it picks up WORKSPACE_PATH
  resetDefaultGuard();

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.filesystem',
    appVersion: '2.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  host.onMessage((msg) => {
    const m = msg as Record<string, unknown>;
    const type = m.type as string;
    const sessionId = m.sessionId as string;
    const requestId = (m.requestId as string) ?? (m.id as string);

    if (type === 'get_system_secrets') {
      host.send({
        ...createEnvelope('system_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: {},
      } as MessageBase);
    }
  });

  appStation.accept(ctrlSide);
});

afterEach(async () => {
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Filesystem Agent App', () => {
  it('lists all 18 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools).toHaveLength(18);
    expect(tools.map((t) => t.name).sort()).toEqual([
      'append',
      'copy',
      'delete',
      'edit',
      'glob',
      'grep',
      'hash',
      'list',
      'list-roots',
      'mkdir',
      'move',
      'patch',
      'read',
      'read-batch',
      'read-media',
      'stat',
      'tree',
      'write',
    ]);
  });

  it('health check reports ready', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('read returns file content with line numbers', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'read', { filePath: join(testDir, 'hello.txt') });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.name).toBe('hello.txt');
    expect(data.totalLines).toBe(3);
    expect(data.content as string).toContain('Hello, world!');
    expect(data.content as string).toContain('00001|');
  });

  it('write creates a new file', async () => {
    const sessionId = await initAndOpen();
    const newFile = join(testDir, 'new-file.txt');

    received.length = 0;
    sendToolCall(sessionId, 'write', { filePath: newFile, content: 'New content!' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.created).toBe(true);
    expect(data.name).toBe('new-file.txt');
  });

  it('edit replaces text in a file', async () => {
    const sessionId = await initAndOpen();
    const editFile = join(testDir, 'edit-test.txt');
    writeFileSync(editFile, 'foo bar baz');

    received.length = 0;
    sendToolCall(sessionId, 'edit', {
      filePath: editFile,
      oldString: 'bar',
      newString: 'qux',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.replacements).toBe(1);
    expect(data.diff as string).toContain('-foo bar baz');
    expect(data.diff as string).toContain('+foo qux baz');
  });

  it('list returns directory entries', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list', { path: testDir });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const entries = data.entries as Array<Record<string, unknown>>;
    expect(entries.length).toBeGreaterThanOrEqual(3);
    const names = entries.map((e) => e.name);
    expect(names).toContain('hello.txt');
    expect(names).toContain('subdir');
  });

  it('stat returns file metadata', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'stat', { path: join(testDir, 'hello.txt') });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.exists).toBe(true);
    expect(data.type).toBe('file');
    expect(data.name).toBe('hello.txt');
    expect(typeof data.size).toBe('number');
  });

  it('stat returns exists=false for missing path', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'stat', { path: join(testDir, 'nonexistent.xyz') });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.exists).toBe(false);
  });

  it('mkdir creates a directory', async () => {
    const sessionId = await initAndOpen();
    const newDir = join(testDir, 'new-dir');

    received.length = 0;
    sendToolCall(sessionId, 'mkdir', { path: newDir });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.created).toBe(true);
  });

  it('hash computes file hash', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'hash', { filePath: join(testDir, 'hello.txt') });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.algorithm).toBe('sha256');
    expect(typeof data.hash).toBe('string');
    expect((data.hash as string).length).toBe(64); // sha256 hex length
  });

  it('glob finds files by pattern', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'glob', { pattern: '**/*.ts', path: testDir });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const entries = data.entries as Array<Record<string, unknown>>;
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e) => (e.path as string).endsWith('nested.ts'))).toBe(true);
  });

  it('tree returns hierarchical structure', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'tree', { path: testDir, depth: 2 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.totalNodes).toBeGreaterThanOrEqual(3);
    const tree = data.tree as Record<string, unknown>;
    expect(tree.type).toBe('directory');
    expect(Array.isArray(tree.children)).toBe(true);
  });

  it('append adds content to file', async () => {
    const sessionId = await initAndOpen();
    const appendFile = join(testDir, 'append-test.txt');
    writeFileSync(appendFile, 'line1\n');

    received.length = 0;
    sendToolCall(sessionId, 'append', { filePath: appendFile, content: 'line2\n' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.created).toBe(false);
    expect(data.bytesAppended).toBe(6);
  });

  it('delete removes a file', async () => {
    const sessionId = await initAndOpen();
    const delFile = join(testDir, 'to-delete.txt');
    writeFileSync(delFile, 'bye');

    received.length = 0;
    sendToolCall(sessionId, 'delete', { path: delFile });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.existed).toBe(true);
    expect(data.deleted).toBe(true);
  });

  it('list-roots returns workspace roots', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-roots', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.count).toBeGreaterThanOrEqual(1);
    const roots = data.roots as Array<Record<string, unknown>>;
    expect(roots[0].exists).toBe(true);
  });
});
