/**
 * Tests for the Freshdesk Agent App.
 *
 * Mocks the Freshdesk API so tests run without real credentials.
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
    installationId: 'inst_freshdesk',
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
    context: { userId: 'u_test', installationId: 'inst_freshdesk' },
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
      json: () => Promise.resolve({}),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.freshdesk',
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
        secrets: { DOMAIN: 'testcompany', API_KEY: 'fake_api_key_123' },
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

describe('Freshdesk Agent App', () => {
  it('lists all 18 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-note-to-ticket',
      'create-company',
      'create-contact',
      'create-ticket',
      'delete-ticket',
      'get-company',
      'get-contact',
      'get-ticket',
      'list-agents',
      'list-companies',
      'list-contacts',
      'list-groups',
      'list-ticket-conversations',
      'list-tickets',
      'list-time-entries',
      'reply-to-ticket',
      'search-tickets',
      'update-ticket',
    ]);
  });

  it('health check reports ready with credentials', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('list-tickets returns ticket data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, subject: 'Cannot login', status: 2, priority: 3 },
            { id: 2, subject: 'Billing question', status: 3, priority: 1 },
          ]),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-tickets', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.count).toBe(2);
    expect((data.tickets as unknown[]).length).toBe(2);
  });

  it('create-ticket succeeds with required fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 42,
          subject: 'New issue',
          description: '<p>Something broke</p>',
          status: 2,
          priority: 1,
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-ticket', {
      subject: 'New issue',
      description: '<p>Something broke</p>',
      email: 'user@example.com',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe(42);
    expect(data.subject).toBe('New issue');

    // Verify the POST call was made with JSON body
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('freshdesk.com/api/v2/tickets');
    const body = JSON.parse(opts.body as string);
    expect(body.subject).toBe('New issue');
    expect(body.email).toBe('user@example.com');
  });

  it('get-contact returns contact data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 101,
            name: 'Alice Smith',
            email: 'alice@example.com',
            phone: '+1-555-0100',
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-contact', { contactId: 101 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe(101);
    expect(data.name).toBe('Alice Smith');
    expect(data.email).toBe('alice@example.com');
  });

  it('search-tickets passes query and returns results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          total: 1,
          results: [{ id: 7, subject: 'Password reset', status: 2, priority: 2 }],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-tickets', { query: 'status:2 AND priority:2' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.total).toBe(1);
    expect((data.tickets as unknown[]).length).toBe(1);

    // Verify the query was passed correctly in the URL
    const getCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const url = call[0] as string;
      return url.includes('/search/tickets');
    });
    expect(getCall).toBeDefined();
    const url = getCall![0] as string;
    expect(url).toContain('query=');
  });

  it('API error returns failure with Freshdesk error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(JSON.stringify({ description: 'Authentication failure' })),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-tickets', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('FRESHDESK_ERROR');
    expect(error.message as string).toContain('401');
  });
});
