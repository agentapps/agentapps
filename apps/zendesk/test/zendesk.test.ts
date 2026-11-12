/**
 * Tests for the Zendesk Agent App.
 *
 * Mocks the Zendesk REST API so tests run without real credentials.
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
// Constants
// ---------------------------------------------------------------------------

const TEST_SECRETS = {
  SUBDOMAIN: 'testcompany',
  EMAIL: 'agent@testcompany.com',
  API_TOKEN: 'test-zendesk-token',
};

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
    installationId: 'inst_zendesk',
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
    context: { userId: 'u_test', installationId: 'inst_zendesk' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

function setupWithSecrets(secrets: Record<string, string> | null = TEST_SECRETS): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.zendesk',
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
        secrets,
      } as MessageBase);
    }
  });

  appStation.accept(ctrlSide);
}

beforeEach(() => {
  setupWithSecrets(TEST_SECRETS);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Zendesk Agent App', () => {
  // -----------------------------------------------------------------------
  // Tool listing
  // -----------------------------------------------------------------------

  it('lists all 25 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-comment-with-attachment',
      'add-ticket-comment',
      'create-organization',
      'create-ticket',
      'create-user',
      'delete-ticket',
      'get-attachment',
      'get-organization',
      'get-ticket',
      'get-user',
      'get-view-tickets',
      'list-automations',
      'list-groups',
      'list-organizations',
      'list-satisfaction-ratings',
      'list-ticket-comments',
      'list-tickets',
      'list-triggers',
      'list-users',
      'list-views',
      'list-webhooks',
      'search-tickets',
      'update-ticket',
      'update-user',
      'upload-attachment',
    ]);
  });

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------

  it('health check reports ready when validateCredentials succeeds', async () => {
    // The Zendesk health handler calls validateCredentials(ctx) and returns
    // { status: 'ready' } when credentials are valid. The SDK correctly
    // reports 'ready'.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ user: { id: 123, name: 'Test Agent' } }),
        text: () => Promise.resolve(JSON.stringify({ user: { id: 123, name: 'Test Agent' } })),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('health check reports degraded when credentials are invalid', async () => {
    // When validateCredentials throws (e.g. 401), the SDK catch block
    // also reports 'degraded' with the error message.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: "Couldn't authenticate you" })),
        headers: new Map(),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
    expect(health.message as string).toContain('Health check failed');
  });

  // -----------------------------------------------------------------------
  // list-tickets
  // -----------------------------------------------------------------------

  it('list-tickets returns curated ticket rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              tickets: [
                {
                  id: 101,
                  subject: 'Cannot login',
                  status: 'open',
                  priority: 'high',
                  type: 'problem',
                  requester_id: 1001,
                  assignee_id: 2001,
                  organization_id: 3001,
                  group_id: 4001,
                  created_at: '2026-07-01T10:00:00Z',
                  updated_at: '2026-07-02T14:00:00Z',
                  tags: ['login', 'urgent'],
                },
                {
                  id: 102,
                  subject: 'Feature request',
                  status: 'pending',
                  priority: 'low',
                  type: 'task',
                  requester_id: 1002,
                  assignee_id: null,
                  organization_id: 3001,
                  group_id: 4001,
                  created_at: '2026-07-03T09:00:00Z',
                  updated_at: '2026-07-03T09:30:00Z',
                  tags: [],
                },
              ],
              next_page: null,
            }),
          ),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-tickets', { status: 'open', limit: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const tickets = data.tickets as Array<Record<string, unknown>>;
    expect(tickets).toHaveLength(2);
    expect(tickets[0].id).toBe(101);
    expect(tickets[0].subject).toBe('Cannot login');
    expect(tickets[0].status).toBe('open');
    expect(tickets[0].priority).toBe('high');
    expect(tickets[0].tags).toEqual(['login', 'urgent']);
    expect(data.total).toBe(2);
    expect(data.hasMore).toBe(false);
  });

  it('list-tickets passes query params to Zendesk API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ tickets: [], next_page: null })),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-tickets', {
      status: 'pending',
      priority: 'high',
      assigneeId: '42',
      limit: 5,
      page: 2,
    });

    await waitForType('tool_result');

    const fetchCall = fetchMock.mock.calls[0];
    const url = new URL(fetchCall[0] as string);
    expect(url.hostname).toBe('testcompany.zendesk.com');
    expect(url.pathname).toBe('/api/v2/tickets.json');
    expect(url.searchParams.get('per_page')).toBe('5');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('status')).toBe('pending');
    expect(url.searchParams.get('priority')).toBe('high');
    expect(url.searchParams.get('assignee_id')).toBe('42');
  });

  // -----------------------------------------------------------------------
  // create-ticket
  // -----------------------------------------------------------------------

  it('create-ticket sends correct payload and returns created ticket', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            ticket: {
              id: 201,
              subject: 'New issue',
              status: 'open',
              priority: 'normal',
              requester_id: 1001,
              assignee_id: null,
              created_at: '2026-07-30T12:00:00Z',
              url: 'https://testcompany.zendesk.com/api/v2/tickets/201.json',
            },
          }),
        ),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-ticket', {
      subject: 'New issue',
      description: 'Something is broken',
      priority: 'normal',
      tags: ['bug', 'frontend'],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe(201);
    expect(data.subject).toBe('New issue');
    expect(data.status).toBe('open');

    // Verify the POST body
    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[1].method).toBe('POST');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.ticket.subject).toBe('New issue');
    expect(body.ticket.comment.body).toBe('Something is broken');
    expect(body.ticket.priority).toBe('normal');
    expect(body.ticket.tags).toEqual(['bug', 'frontend']);
  });

  // -----------------------------------------------------------------------
  // search-tickets
  // -----------------------------------------------------------------------

  it('search-tickets returns filtered ticket results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              results: [
                {
                  id: 301,
                  result_type: 'ticket',
                  subject: 'Billing question',
                  status: 'open',
                  priority: 'normal',
                  type: 'question',
                  requester_id: 1010,
                  assignee_id: 2010,
                  organization_id: 3010,
                  created_at: '2026-07-20T08:00:00Z',
                  updated_at: '2026-07-21T10:00:00Z',
                  tags: ['billing'],
                  url: 'https://testcompany.zendesk.com/api/v2/tickets/301.json',
                },
                {
                  id: 999,
                  result_type: 'user',
                  name: 'Some User',
                },
              ],
              count: 1,
              next_page: null,
            }),
          ),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-tickets', { query: 'status:open type:ticket' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const tickets = data.tickets as Array<Record<string, unknown>>;
    // Should filter out non-ticket results
    expect(tickets).toHaveLength(1);
    expect(tickets[0].id).toBe(301);
    expect(tickets[0].subject).toBe('Billing question');
    expect(tickets[0].tags).toEqual(['billing']);
    expect(data.total).toBe(1);
    expect(data.hasMore).toBe(false);
  });

  it('search-tickets passes query params to Zendesk Search API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ results: [], count: 0, next_page: null })),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-tickets', { query: 'assignee:me', limit: 10, page: 3 });

    await waitForType('tool_result');

    const fetchCall = fetchMock.mock.calls[0];
    const url = new URL(fetchCall[0] as string);
    expect(url.pathname).toBe('/api/v2/search.json');
    expect(url.searchParams.get('query')).toBe('assignee:me');
    expect(url.searchParams.get('per_page')).toBe('10');
    expect(url.searchParams.get('page')).toBe('3');
  });

  // -----------------------------------------------------------------------
  // Error handling — missing credentials
  // -----------------------------------------------------------------------

  it('tool call fails when credentials are missing', async () => {
    // Recreate with null secrets
    await appStation.shutdown();
    vi.unstubAllGlobals();
    setupWithSecrets(null);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-tickets', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('SUBDOMAIN');
  });

  it('tool call fails when API returns 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: "Couldn't authenticate you" })),
        headers: new Map(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-tickets', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('AUTH_INVALID');
  });

  // -----------------------------------------------------------------------
  // API error — 404 Not Found
  // -----------------------------------------------------------------------

  it('tool call fails with NOT_FOUND on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ error: 'RecordNotFound' })),
        headers: new Map(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-ticket', { ticketId: '99999' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('NOT_FOUND');
  });

  // -----------------------------------------------------------------------
  // Auth header verification
  // -----------------------------------------------------------------------

  it('sends correct Basic auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ tickets: [], next_page: null })),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-tickets', {});

    await waitForType('tool_result');

    const fetchCall = fetchMock.mock.calls[0];
    const headers = fetchCall[1].headers as Record<string, string>;
    const expectedAuth = `Basic ${btoa('agent@testcompany.com/token:test-zendesk-token')}`;
    expect(headers.Authorization).toBe(expectedAuth);
    expect(headers['Content-Type']).toBe('application/json');
  });
});
