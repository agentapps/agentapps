/**
 * Tests for the Monday.com Agent App.
 *
 * Mocks the Monday.com GraphQL API so tests run without real credentials.
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
    installationId: 'inst_monday',
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
    context: { userId: 'u_test', installationId: 'inst_monday' },
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
      json: () => Promise.resolve({ data: {} }),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.monday',
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
        secrets: { MONDAY_API_TOKEN: 'test-monday-token' },
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

describe('Monday.com Agent App', () => {
  it('lists all 15 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-update',
      'create-board',
      'create-group',
      'create-item',
      'delete-item',
      'get-board',
      'get-item',
      'get-me',
      'list-boards',
      'list-columns',
      'list-groups',
      'list-items',
      'list-updates',
      'search-items',
      'update-item',
    ]);
  });

  it('health check reports ready with API token', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('health check reports degraded when API token is missing', async () => {
    const runtime = new InProcessRuntime(factory);
    const ctrl = new AppStation({
      appId: 'app.monday',
      appVersion: '2.0.0',
      runtime,
    });
    const [hostSide2, ctrlSide2] = createInProcessTransportPair();
    const received2: MessageBase[] = [];
    hostSide2.onMessage((msg) => received2.push(msg));

    hostSide2.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      const type = m.type as string;
      const sessionId = m.sessionId as string;
      const requestId = (m.requestId as string) ?? (m.id as string);

      if (type === 'get_installation_secrets') {
        hostSide2.send({
          ...createEnvelope('installation_secrets', sessionId),
          id: requestId,
          requestId,
          secrets: {},
        } as MessageBase);
      }
    });

    ctrl.accept(ctrlSide2);

    hostSide2.send({
      ...createEnvelope('initialize'),
      supportedVersions: [PROTOCOL_VERSION],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);

    const waitForType2 = async (type: string): Promise<Record<string, unknown>> => {
      const start = Date.now();
      while (Date.now() - start < 3000) {
        const found = received2.find((m) => (m as Record<string, unknown>).type === type);
        if (found) return found as Record<string, unknown>;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error('Timeout waiting for message');
    };

    await waitForType2('initialized');
    received2.length = 0;

    hostSide2.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_monday_notoken',
      tenant: { userId: 'u_test' },
    } as MessageBase);
    const opened = await waitForType2('session_opened');
    received2.length = 0;

    hostSide2.send({
      ...createEnvelope('health_check'),
      sessionId: (opened as Record<string, unknown>).sessionId,
    } as MessageBase);
    const health = await waitForType2('health_status');

    expect(health.status).toBe('degraded');
    await ctrl.shutdown();
  });

  it('get-me returns user info', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { me: { id: '12345', name: 'Test User', email: 'test@example.com' } },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-me', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('12345');
    expect(data.name).toBe('Test User');
    expect(data.email).toBe('test@example.com');
  });

  it('list-boards returns boards with filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            boards: [
              { id: '1', name: 'Project A', state: 'active', workspace_id: '100' },
              { id: '2', name: 'Project B', state: 'active', workspace_id: '100' },
            ],
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-boards', { limit: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('Project A');
    expect(data[1].name).toBe('Project B');

    // Verify GraphQL query was sent correctly
    const fetchCall = fetchMock.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.query).toContain('boards(limit: 10)');
  });

  it('create-item sends mutation and returns result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            create_item: { id: '999', name: 'New Task' },
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-item', {
      board_id: 123,
      item_name: 'New Task',
      group_id: 'topics',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('999');
    expect(data.name).toBe('New Task');

    // Verify mutation was sent (not a query) and isQuery=false means no retries
    const fetchCall = fetchMock.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.query).toContain('mutation');
    expect(body.query).toContain('create_item');
    expect(body.query).toContain('group_id: "topics"');
  });

  it('search-items filters results by query term', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              boards: [
                {
                  id: '1',
                  name: 'Board A',
                  items_page: {
                    items: [
                      { id: '10', name: 'Fix login bug' },
                      { id: '11', name: 'Add new feature' },
                      { id: '12', name: 'Fix payment bug' },
                    ],
                  },
                },
                {
                  id: '2',
                  name: 'Board B',
                  items_page: {
                    items: [{ id: '20', name: 'Another task' }],
                  },
                },
              ],
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-items', { query: 'bug' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('Fix login bug');
    expect(data[0].board).toEqual({ id: '1', name: 'Board A' });
    expect(data[1].name).toBe('Fix payment bug');
  });

  it('tool call fails on API error (401)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: () => Promise.resolve('{"error_message":"Not Authenticated"}'),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-me', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('Not Authenticated');
  });

  it('tool call fails on GraphQL errors in response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            errors: [{ message: 'Field "nonexistent" not found' }],
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-me', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('Field "nonexistent" not found');
  });
});
