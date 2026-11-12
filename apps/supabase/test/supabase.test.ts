/**
 * Tests for the Supabase Agent App.
 *
 * Mocks the Supabase API so tests run without real credentials.
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
    installationId: 'inst_supabase',
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
    context: { userId: 'u_test', installationId: 'inst_supabase' },
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
      text: () => Promise.resolve('{}'),
      json: () => Promise.resolve({}),
      headers: new Headers(),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.supabase',
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
        secrets: {
          SUPABASE_URL: 'https://test-project.supabase.co',
          SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake-key',
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

describe('Supabase Agent App', () => {
  it('lists all 12 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_bucket',
      'delete_rows',
      'get_public_url',
      'get_row',
      'insert_rows',
      'list_buckets',
      'list_files',
      'list_tables',
      'list_users',
      'query_table',
      'rpc',
      'update_rows',
    ]);
  });

  it('health check reports ready with credentials', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('query_table sends correct URL with filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify([
            { id: 1, name: 'Alice', age: 30 },
            { id: 2, name: 'Bob', age: 25 },
          ]),
        ),
      headers: new Headers({ 'content-range': '0-1/42' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'query_table', {
      table: 'users',
      select: 'id,name,age',
      filter: 'age=gt.18',
      order: 'created_at.desc',
      limit: 10,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.total).toBe(42);
    expect(data.limit).toBe(10);
    expect(data.data).toEqual([
      { id: 1, name: 'Alice', age: 30 },
      { id: 2, name: 'Bob', age: 25 },
    ]);

    // Verify the GET call used correct URL
    const getCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const url = call[0] as string;
      return url.includes('/rest/v1/users');
    });
    expect(getCall).toBeDefined();
    const [url, opts] = getCall as [string, Record<string, unknown>];
    expect(url).toContain('select=id%2Cname%2Cage');
    expect(url).toContain('age=gt.18');
    expect(url).toContain('order=created_at.desc');
    expect(url).toContain('limit=10');
    const headers = opts.headers as Record<string, string>;
    expect(headers.Prefer).toBe('count=exact');
    expect(headers.apikey).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake-key');
  });

  it('insert_rows sends POST with correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(JSON.stringify([{ id: 10, name: 'Charlie', email: 'charlie@test.com' }])),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'insert_rows', {
      table: 'users',
      rows: [{ name: 'Charlie', email: 'charlie@test.com' }],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    // Verify the POST call
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST' && (call[0] as string).includes('/rest/v1/users');
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/rest/v1/users');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual([{ name: 'Charlie', email: 'charlie@test.com' }]);
    const headers = opts.headers as Record<string, string>;
    expect(headers.Prefer).toBe('return=representation');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('list_buckets returns bucket data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify([
              { id: 'avatars', name: 'avatars', public: true },
              { id: 'documents', name: 'documents', public: false },
            ]),
          ),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list_buckets', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('avatars');
    expect(data[1].name).toBe('documents');
  });

  it('rpc sends POST to correct endpoint with params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ total: 42 })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'rpc', {
      functionName: 'get_user_count',
      params: { status: 'active' },
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    // Verify the POST call used the correct RPC endpoint
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST' && (call[0] as string).includes('/rest/v1/rpc/get_user_count');
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/rest/v1/rpc/get_user_count');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ status: 'active' });
  });

  it('API error returns failure with Supabase error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () =>
          Promise.resolve(
            JSON.stringify({
              message: 'Invalid API key',
              hint: 'Check your SUPABASE_KEY',
            }),
          ),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list_tables', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('SUPABASE_ERROR');
    expect(error.message as string).toContain('401');
  });
});
