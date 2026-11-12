/**
 * Tests for the ClickUp Agent App.
 *
 * Mocks the ClickUp API so tests run without real credentials.
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { factory } from '../src/app.js';

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
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = received.find((m) => predicate(m as Record<string, unknown>));
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Timeout waiting for message');
}

async function waitForType(type: string, timeoutMs = 3000): Promise<Record<string, unknown>> {
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
    installationId: 'inst_clickup',
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
    context: { userId: 'u_test', installationId: 'inst_clickup' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.clickup',
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
        secrets: { CLIENT_ID: 'test-client-id', CLIENT_SECRET: 'test-client-secret' },
      } as MessageBase);
    }

    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: {
          ACCESS_TOKEN: 'test-clickup-token',
          REFRESH_TOKEN: 'test-refresh',
          TOKEN_TYPE: 'Bearer',
          USER_ID: 'u_123',
          USER_EMAIL: 'test@example.com',
          USER_USERNAME: 'testuser',
        },
      } as MessageBase);
    }
  });

  appStation.accept(ctrlSide);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClickUp Agent App', () => {
  it('lists all 16 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-comment',
      'create-folder',
      'create-list',
      'create-task',
      'delete-task',
      'get-comments',
      'get-folders',
      'get-lists',
      'get-members',
      'get-spaces',
      'get-task',
      'get-tasks',
      'get-user',
      'get-workspaces',
      'search-tasks',
      'update-task',
    ]);
  });

  it('health check reports ready with valid token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ user: { id: 123, username: 'testuser' } }),
        text: () => Promise.resolve(JSON.stringify({ user: { id: 123 } })),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('get-workspaces returns workspace list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            teams: [
              {
                id: 'ws_1',
                name: 'My Workspace',
                color: '#FF0000',
                avatar: null,
                members: [1, 2, 3],
              },
              { id: 'ws_2', name: 'Other Workspace', color: '#00FF00', avatar: null, members: [1] },
            ],
          }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-workspaces', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const workspaces = data.workspaces as Array<Record<string, unknown>>;
    expect(workspaces).toHaveLength(2);
    expect(workspaces[0].name).toBe('My Workspace');
    expect(workspaces[0].memberCount).toBe(3);
    expect(workspaces[1].name).toBe('Other Workspace');
  });

  it('create-task creates a task and returns formatted result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'task_abc',
            name: 'New Feature',
            description: 'Implement login page',
            status: { status: 'to do' },
            priority: { priority: 'high' },
            assignees: [{ id: 1, username: 'dev1', email: 'dev1@example.com' }],
            tags: [{ name: 'frontend' }],
            due_date: '1700000000000',
            start_date: null,
            date_created: '1699000000000',
            date_updated: '1699000000000',
            creator: { id: 1, username: 'dev1', email: 'dev1@example.com' },
            list: { id: 'list_1', name: 'Sprint 1' },
            folder: { id: 'folder_1', name: 'Project A' },
            url: 'https://app.clickup.com/t/task_abc',
            parent: null,
          }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-task', {
      listId: 'list_1',
      name: 'New Feature',
      description: 'Implement login page',
      priority: 'high',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('task_abc');
    expect(data.name).toBe('New Feature');
    expect(data.status).toBe('to do');
    expect(data.priority).toBe('high');
    expect(data.url).toBe('https://app.clickup.com/t/task_abc');
  });

  it('get-tasks returns filtered task list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            tasks: [
              {
                id: 't1',
                name: 'Task 1',
                description: '',
                status: { status: 'open' },
                priority: null,
                assignees: [],
                tags: [],
                due_date: null,
                start_date: null,
                date_created: '1699000000000',
                date_updated: '1699000000000',
                creator: null,
                list: { id: 'l1', name: 'List' },
                folder: null,
                url: '',
                parent: null,
              },
              {
                id: 't2',
                name: 'Task 2',
                description: '',
                status: { status: 'in progress' },
                priority: null,
                assignees: [],
                tags: [],
                due_date: null,
                start_date: null,
                date_created: '1699000000000',
                date_updated: '1699000000000',
                creator: null,
                list: { id: 'l1', name: 'List' },
                folder: null,
                url: '',
                parent: null,
              },
            ],
          }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-tasks', { listId: 'list_1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.count).toBe(2);
    expect(data.listId).toBe('list_1');
    const tasks = data.tasks as Array<Record<string, unknown>>;
    expect(tasks[0].name).toBe('Task 1');
    expect(tasks[1].name).toBe('Task 2');
  });

  it('tool call fails on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('{"err": "Token invalid"}'),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-user', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('401');
  });
});
