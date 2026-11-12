/**
 * Tests for the Todo List Agent App.
 *
 * Uses an in-process transport pair with a mock storage layer.
 * Tests cover: tool listing, health check, CRUD operations, tree operations,
 * search, log entries, events, and error handling.
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import factory from '../src/app.js';
import { MemoryStorage } from './helpers/memory-storage.js';

// ---------------------------------------------------------------------------
// Mock storage — an in-memory document store answering storage_* requests
// ---------------------------------------------------------------------------

const mockStore = new MemoryStorage();
const INSTALLATION_ID = 'inst_todo';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let appStation: AppStation;
let host: Transport;
let received: MessageBase[];

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
    host: { name: 'test', version: '1.0.0' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitForType('initialized');

  received.length = 0;
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'inst_todo',
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
    context: { userId: 'u_test', installationId: 'inst_todo' },
  } as MessageBase);
}

async function callTool(
  sessionId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  received.length = 0;
  sendToolCall(sessionId, tool, args);
  const result = await waitForType('tool_result');
  return result;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockStore.clear();
  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.todo-list',
    appVersion: '1.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  host.onMessage((msg) => {
    const m = msg as Record<string, unknown>;
    const type = m.type as string;

    if (type === 'get_system_secrets') {
      const requestId = (m.requestId as string) ?? (m.id as string);
      host.send({
        ...createEnvelope('system_secrets'),
        id: requestId,
        requestId,
        secrets: {},
      } as MessageBase);
    } else if (type.startsWith('storage_')) {
      mockStore.reply(m, host, INSTALLATION_ID);
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

describe('Todo List Agent App', () => {
  it('lists all 10 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    const expected = [
      'add-log-entry',
      'add-node',
      'delete-node',
      'get-node',
      'get-tree',
      'move-node',
      'search-nodes',
      'toggle-collapse',
      'toggle-complete',
      'update-node',
    ];
    expect(tools.map((t) => t.name).sort()).toEqual(expected);
  });

  it('health check reports ready', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('adds a root node', async () => {
    const sessionId = await initAndOpen();

    const result = await callTool(sessionId, 'add-node', {
      text: 'My first task',
      description: 'A test task',
    });

    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    const node = data.node as Record<string, unknown>;
    expect(node.text).toBe('My first task');
    expect(node.description).toBe('A test task');
    expect(node.parentId).toBeNull();
    expect(node.completed).toBe(false);
    expect(node.nodeId).toMatch(/^tn_/);
  });

  it('adds a child node', async () => {
    const sessionId = await initAndOpen();

    const rootResult = await callTool(sessionId, 'add-node', { text: 'Root task' });
    const rootNode = (rootResult.result as Record<string, unknown>).node as Record<string, unknown>;
    const parentId = rootNode.nodeId as string;

    const childResult = await callTool(sessionId, 'add-node', {
      text: 'Child task',
      parentId,
    });
    const childNode = (childResult.result as Record<string, unknown>).node as Record<
      string,
      unknown
    >;

    expect(childNode.text).toBe('Child task');
    expect(childNode.parentId).toBe(parentId);
  });

  it('gets the tree', async () => {
    const sessionId = await initAndOpen();

    const rootResult = await callTool(sessionId, 'add-node', { text: 'Root' });
    const rootNode = (rootResult.result as Record<string, unknown>).node as Record<string, unknown>;
    await callTool(sessionId, 'add-node', { text: 'Child', parentId: rootNode.nodeId });

    const treeResult = await callTool(sessionId, 'get-tree', {});
    const data = treeResult.result as Record<string, unknown>;
    const tree = data.tree as Array<Record<string, unknown>>;

    // onSessionOpen seeds the default root "My Tasks" (lifecycle.ts).
    expect(tree.map((n) => n.text)).toEqual(['My Tasks', 'Root']);
    const root = tree.find((n) => n.text === 'Root') as Record<string, unknown>;
    const children = root.children as Array<Record<string, unknown>>;
    expect(children).toHaveLength(1);
    expect(children[0].text).toBe('Child');
  });

  it('updates a node', async () => {
    const sessionId = await initAndOpen();

    const addResult = await callTool(sessionId, 'add-node', { text: 'Original' });
    const node = (addResult.result as Record<string, unknown>).node as Record<string, unknown>;

    const updateResult = await callTool(sessionId, 'update-node', {
      nodeId: node.nodeId,
      text: 'Updated',
      description: 'New description',
    });
    const updated = (updateResult.result as Record<string, unknown>).node as Record<
      string,
      unknown
    >;

    expect(updated.text).toBe('Updated');
    expect(updated.description).toBe('New description');
  });

  it('toggles complete (cascades to descendants)', async () => {
    const sessionId = await initAndOpen();

    const rootResult = await callTool(sessionId, 'add-node', { text: 'Parent' });
    const rootNode = (rootResult.result as Record<string, unknown>).node as Record<string, unknown>;
    await callTool(sessionId, 'add-node', { text: 'Child', parentId: rootNode.nodeId });

    const toggleResult = await callTool(sessionId, 'toggle-complete', { nodeId: rootNode.nodeId });
    const toggled = (toggleResult.result as Record<string, unknown>).node as Record<
      string,
      unknown
    >;
    expect(toggled.completed).toBe(true);

    const treeResult = await callTool(sessionId, 'get-tree', {});
    const tree = (treeResult.result as Record<string, unknown>).tree as Array<
      Record<string, unknown>
    >;
    const root = tree.find((n) => n.text === 'Parent') as Record<string, unknown>;
    const children = root.children as Array<Record<string, unknown>>;
    expect(children[0].completed).toBe(true);
  });

  it('toggles collapse', async () => {
    const sessionId = await initAndOpen();

    const addResult = await callTool(sessionId, 'add-node', { text: 'Node' });
    const node = (addResult.result as Record<string, unknown>).node as Record<string, unknown>;

    const toggleResult = await callTool(sessionId, 'toggle-collapse', { nodeId: node.nodeId });
    const toggled = (toggleResult.result as Record<string, unknown>).node as Record<
      string,
      unknown
    >;
    expect(toggled.collapsed).toBe(true);
  });

  it('moves a node to a different parent', async () => {
    const sessionId = await initAndOpen();

    const aResult = await callTool(sessionId, 'add-node', { text: 'A' });
    const bResult = await callTool(sessionId, 'add-node', { text: 'B' });
    const cResult = await callTool(sessionId, 'add-node', { text: 'C' });
    const aId = (aResult.result as Record<string, unknown>).node.nodeId as string;
    const bId = (bResult.result as Record<string, unknown>).node.nodeId as string;
    const cId = (cResult.result as Record<string, unknown>).node.nodeId as string;

    const moveResult = await callTool(sessionId, 'move-node', { nodeId: cId, newParentId: aId });
    const moved = (moveResult.result as Record<string, unknown>).node as Record<string, unknown>;
    expect(moved.parentId).toBe(aId);

    const treeResult = await callTool(sessionId, 'get-tree', {});
    const tree = (treeResult.result as Record<string, unknown>).tree as Array<
      Record<string, unknown>
    >;
    const aNode = tree.find((n) => n.nodeId === aId);
    const bNode = tree.find((n) => n.nodeId === bId);
    expect(aNode).toBeDefined();
    expect(bNode).toBeDefined();
    const aChildren = aNode!.children as Array<Record<string, unknown>> | undefined;
    expect(aChildren).toBeDefined();
    expect(aChildren!.find((c) => c.nodeId === cId)).toBeDefined();
    expect(bNode!.children as Array<Record<string, unknown>> | undefined).toBeUndefined();
  });

  it('prevents circular moves', async () => {
    const sessionId = await initAndOpen();

    const aResult = await callTool(sessionId, 'add-node', { text: 'A' });
    const aId = (aResult.result as Record<string, unknown>).node.nodeId as string;
    const bResult = await callTool(sessionId, 'add-node', { text: 'B', parentId: aId });
    const bId = (bResult.result as Record<string, unknown>).node.nodeId as string;

    const result = await callTool(sessionId, 'move-node', { nodeId: aId, newParentId: bId });
    expect(result.success).toBe(false);
    expect((result.error as { message?: string })?.message ?? '').toContain('CIRCULAR_MOVE');
  });

  it('deletes a node and its subtree', async () => {
    const sessionId = await initAndOpen();

    const rootResult = await callTool(sessionId, 'add-node', { text: 'Root' });
    const rootNode = (rootResult.result as Record<string, unknown>).node as Record<string, unknown>;
    await callTool(sessionId, 'add-node', { text: 'Child', parentId: rootNode.nodeId });

    const deleteResult = await callTool(sessionId, 'delete-node', {
      nodeId: rootNode.nodeId as string,
    });
    const data = deleteResult.result as Record<string, unknown>;
    expect(data.deleted).toBe(true);

    const treeResult = await callTool(sessionId, 'get-tree', {});
    const tree = (treeResult.result as Record<string, unknown>).tree as Array<
      Record<string, unknown>
    >;
    // Only the default root seeded by onSessionOpen remains.
    expect(tree.map((n) => n.text)).toEqual(['My Tasks']);
  });

  it('searches nodes by text', async () => {
    const sessionId = await initAndOpen();

    await callTool(sessionId, 'add-node', { text: 'Buy groceries' });
    await callTool(sessionId, 'add-node', { text: 'Walk the dog' });
    await callTool(sessionId, 'add-node', { text: 'Buy presents' });

    const searchResult = await callTool(sessionId, 'search-nodes', { query: 'buy' });
    const data = searchResult.result as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;

    expect(results).toHaveLength(2);
    expect(results.every((r) => (r.text as string).toLowerCase().includes('buy'))).toBe(true);
  });

  it('adds a log entry to a node', async () => {
    const sessionId = await initAndOpen();

    const addResult = await callTool(sessionId, 'add-node', { text: 'Task with log' });
    const nodeId = (addResult.result as Record<string, unknown>).node.nodeId as string;

    const logResult = await callTool(sessionId, 'add-log-entry', {
      nodeId,
      text: 'Started working on this',
    });
    const data = logResult.result as Record<string, unknown>;
    const node = data.node as Record<string, unknown>;
    const log = node.log as Array<Record<string, unknown>>;
    expect(log).toHaveLength(1);
    expect(log[0].text).toBe('Started working on this');
  });

  it('returns NOT_FOUND for non-existent node', async () => {
    const sessionId = await initAndOpen();

    const result = await callTool(sessionId, 'get-node', { nodeId: 'tn_nonexistent' });
    expect(result.success).toBe(false);
    expect((result.error as { message?: string })?.message ?? '').toContain('NOT_FOUND');
  });

  it('persists data across tool calls (storage-backed)', async () => {
    const sessionId = await initAndOpen();

    const addResult = await callTool(sessionId, 'add-node', { text: 'Persisted task' });
    const nodeId = (addResult.result as Record<string, unknown>).node.nodeId as string;

    const getResult = await callTool(sessionId, 'get-node', { nodeId });
    const data = getResult.result as Record<string, unknown>;
    const node = data.node as Record<string, unknown>;
    expect(node.text).toBe('Persisted task');
  });
});
