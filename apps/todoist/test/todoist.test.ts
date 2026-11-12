/**
 * Tests for the Todoist Agent App.
 *
 * Mocks the Todoist REST API so tests run without real credentials.
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
    installationId: 'inst_todoist',
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
    context: { userId: 'u_test', installationId: 'inst_todoist' },
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
      text: () => Promise.resolve('[]'),
      json: () => Promise.resolve([]),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.todoist',
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
        secrets: apiToken ? { TODOIST_API_TOKEN: apiToken } : {},
      } as MessageBase);
    }
  });

  appStation.accept(ctrlSide);
}

beforeEach(() => {
  setupController('test-todoist-token');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Todoist Agent App', () => {
  // -----------------------------------------------------------------------
  // Tool listing
  // -----------------------------------------------------------------------

  it('lists all 23 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'close-task',
      'create-comment',
      'create-label',
      'create-project',
      'create-section',
      'create-task',
      'delete-label',
      'delete-project',
      'delete-section',
      'delete-task',
      'get-project',
      'get-section',
      'get-task',
      'list-comments',
      'list-labels',
      'list-projects',
      'list-sections',
      'list-tasks',
      'reopen-task',
      'update-label',
      'update-project',
      'update-section',
      'update-task',
    ]);
  });

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------

  it('health check reports ready with valid API token', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('health check reports degraded without API token', async () => {
    await appStation.shutdown();
    setupController(null);

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
  });

  // -----------------------------------------------------------------------
  // list-projects
  // -----------------------------------------------------------------------

  it('list-projects returns projects from Todoist API', async () => {
    const mockProjects = [
      { id: '111', name: 'Inbox', color: 'grey', is_favorite: false },
      { id: '222', name: 'Work', color: 'blue', is_favorite: true },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockProjects)),
        json: () => Promise.resolve(mockProjects),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-projects', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const projects = data.projects as Array<Record<string, unknown>>;
    expect(projects).toHaveLength(2);
    expect(projects[0].name).toBe('Inbox');
    expect(projects[1].name).toBe('Work');
  });

  // -----------------------------------------------------------------------
  // create-task
  // -----------------------------------------------------------------------

  it('create-task sends POST and returns created task', async () => {
    const createdTask = {
      id: 't-001',
      content: 'Buy groceries',
      description: 'Milk, eggs, bread',
      project_id: '222',
      priority: 3,
      labels: ['shopping'],
      is_completed: false,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(createdTask)),
      json: () => Promise.resolve(createdTask),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-task', {
      content: 'Buy groceries',
      description: 'Milk, eggs, bread',
      projectId: '222',
      priority: 3,
      labels: ['shopping'],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const task = data.task as Record<string, unknown>;
    expect(task.id).toBe('t-001');
    expect(task.content).toBe('Buy groceries');

    // Verify the fetch call was made with correct params
    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toContain('/tasks');
    expect(fetchCall[1].method).toBe('POST');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.content).toBe('Buy groceries');
    expect(body.description).toBe('Milk, eggs, bread');
    expect(body.project_id).toBe('222');
    expect(body.priority).toBe(3);
    expect(body.labels).toEqual(['shopping']);
  });

  // -----------------------------------------------------------------------
  // list-tasks
  // -----------------------------------------------------------------------

  it('list-tasks returns tasks and passes filter params', async () => {
    const mockTasks = [
      { id: 't-001', content: 'Task 1', project_id: '222', is_completed: false },
      { id: 't-002', content: 'Task 2', project_id: '222', is_completed: false },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(mockTasks)),
      json: () => Promise.resolve(mockTasks),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-tasks', { projectId: '222' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const tasks = data.tasks as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(2);
    expect(tasks[0].content).toBe('Task 1');
    expect(tasks[1].content).toBe('Task 2');

    // Verify query params were sent
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('project_id=222');
  });

  // -----------------------------------------------------------------------
  // close-task (complete-task)
  // -----------------------------------------------------------------------

  it('close-task marks a task as completed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({}),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'close-task', { taskId: 't-001' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.taskId).toBe('t-001');
    expect(data.closed).toBe(true);
  });

  it('close-task calls the correct endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'close-task', { taskId: 't-999' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/tasks/t-999/close');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  // -----------------------------------------------------------------------
  // Error handling — 401 Unauthorized
  // -----------------------------------------------------------------------

  it('returns error on 401 Unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Forbidden'),
        headers: new Map(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-projects', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('AUTH_INVALID');
  });

  // -----------------------------------------------------------------------
  // Error handling — 404 Not Found
  // -----------------------------------------------------------------------

  it('returns error on 404 Not Found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Task not found'),
        headers: new Map(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-task', { taskId: 'nonexistent' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('NOT_FOUND');
  });
});
