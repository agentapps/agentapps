/**
 * Tests for the Asana Agent App.
 *
 * Mocks the Asana REST API so tests run without real credentials.
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
    installationId: 'inst_asana',
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
    context: { userId: 'u_test', installationId: 'inst_asana' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

function setupController(apiToken: string | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: {} })),
      json: () => Promise.resolve({ data: {} }),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.asana',
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

    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: apiToken ? { ACCESS_TOKEN: apiToken } : {},
      } as MessageBase);
    }
  });

  appStation.accept(ctrlSide);
}

beforeEach(() => {
  setupController('test-asana-token');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Asana Agent App', () => {
  // -----------------------------------------------------------------------
  // Tool listing
  // -----------------------------------------------------------------------

  it('lists all 18 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-followers',
      'add-tag-to-task',
      'add-task-to-section',
      'create-section',
      'create-tag',
      'create-task',
      'delete-task',
      'get-project',
      'get-task',
      'get-user',
      'list-projects',
      'list-sections',
      'list-tags',
      'list-tasks',
      'list-teams',
      'list-workspaces',
      'search-tasks',
      'update-task',
    ]);
  });

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------

  it('health check reports ready with valid access token', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  // -----------------------------------------------------------------------
  // list-workspaces
  // -----------------------------------------------------------------------

  it('list-workspaces returns data from Asana API', async () => {
    const mockWorkspaces = [
      { gid: '111', name: 'My Workspace', is_organization: false },
      { gid: '222', name: 'Agent Apps Org', is_organization: true },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: mockWorkspaces })),
        json: () => Promise.resolve({ data: mockWorkspaces }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-workspaces', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const workspaces = data.workspaces as Array<Record<string, unknown>>;
    expect(workspaces).toHaveLength(2);
    expect(workspaces[0].name).toBe('My Workspace');
    expect(workspaces[1].name).toBe('Agent Apps Org');
  });

  // -----------------------------------------------------------------------
  // get-task
  // -----------------------------------------------------------------------

  it('get-task returns a task from Asana API', async () => {
    const mockTask = {
      gid: 't-001',
      name: 'Design homepage',
      notes: 'Create wireframes',
      completed: false,
      assignee: { gid: 'u-001', name: 'Alice' },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: mockTask })),
        json: () => Promise.resolve({ data: mockTask }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-task', { taskId: 't-001' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const task = data.task as Record<string, unknown>;
    expect(task.gid).toBe('t-001');
    expect(task.name).toBe('Design homepage');
  });

  // -----------------------------------------------------------------------
  // create-task
  // -----------------------------------------------------------------------

  it('create-task sends JSON body and returns created task', async () => {
    const createdTask = {
      gid: 't-002',
      name: 'Write tests',
      notes: 'Unit + integration',
      completed: false,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: createdTask })),
      json: () => Promise.resolve({ data: createdTask }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-task', {
      name: 'Write tests',
      notes: 'Unit + integration',
      workspace: 'ws-001',
      projects: ['proj-001'],
      assignee: 'alice@teros.ai',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const task = data.task as Record<string, unknown>;
    expect(task.gid).toBe('t-002');
    expect(task.name).toBe('Write tests');

    // Verify the fetch call was made with correct params
    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toContain('/tasks');
    expect(fetchCall[1].method).toBe('POST');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.data.name).toBe('Write tests');
    expect(body.data.notes).toBe('Unit + integration');
    expect(body.data.workspace).toBe('ws-001');
    expect(body.data.projects).toEqual(['proj-001']);
    expect(body.data.assignee).toBe('alice@teros.ai');
  });

  // -----------------------------------------------------------------------
  // search-tasks
  // -----------------------------------------------------------------------

  it('search-tasks sends query params and returns matching tasks', async () => {
    const mockResults = [
      { gid: 't-100', name: 'Fix login bug', completed: false },
      { gid: 't-101', name: 'Fix logout bug', completed: false },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: mockResults })),
      json: () => Promise.resolve({ data: mockResults }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-tasks', {
      workspaceId: 'ws-001',
      text: 'Fix',
      completed: false,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const tasks = data.tasks as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(2);
    expect(tasks[0].name).toBe('Fix login bug');

    // Verify the fetch call was made with correct query params
    const fetchCall = fetchMock.mock.calls[0];
    const url = fetchCall[0] as string;
    expect(url).toContain('/workspaces/ws-001/tasks/search');
    expect(url).toContain('text=Fix');
    expect(url).toContain('completed=false');
  });

  // -----------------------------------------------------------------------
  // Error handling — API error returns failure
  // -----------------------------------------------------------------------

  it('returns error on API failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ errors: [{ message: 'Not Authorized' }] })),
        headers: new Map(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-workspaces', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('AUTH_INVALID');
  });
});
