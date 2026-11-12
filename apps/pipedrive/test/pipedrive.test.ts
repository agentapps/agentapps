/**
 * Tests for the Pipedrive Agent App.
 *
 * Mocks the Pipedrive API so tests run without real credentials.
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
    installationId: 'inst_pipedrive',
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
    context: { userId: 'u_test', installationId: 'inst_pipedrive' },
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
    appId: 'app.pipedrive',
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
        secrets: { API_TOKEN: 'pd_test_fake123' },
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

describe('Pipedrive Agent App', () => {
  it('lists all 18 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'create-activity',
      'create-deal',
      'create-note',
      'create-organization',
      'create-person',
      'delete-deal',
      'get-deal',
      'get-organization',
      'get-person',
      'list-activities',
      'list-deals',
      'list-notes',
      'list-organizations',
      'list-persons',
      'list-pipelines',
      'list-stages',
      'update-deal',
      'update-organization',
    ]);
  });

  it('health check reports ready with API token', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('list-deals returns deal data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: [
              { id: 1, title: 'Big Deal', value: 50000, currency: 'USD', status: 'open' },
              { id: 2, title: 'Small Deal', value: 1000, currency: 'EUR', status: 'won' },
            ],
            additional_data: {
              pagination: { start: 0, limit: 100, more_items_in_collection: false },
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-deals', { status: 'open', limit: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.data as Array<Record<string, unknown>>).toHaveLength(2);
  });

  it('create-deal succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            id: 42,
            title: 'New Enterprise Deal',
            value: 100000,
            currency: 'USD',
            status: 'open',
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-deal', {
      title: 'New Enterprise Deal',
      value: 100000,
      currency: 'USD',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const resultData = result.result as Record<string, unknown>;
    expect(resultData.success).toBe(true);
    const deal = resultData.data as Record<string, unknown>;
    expect(deal.id).toBe(42);
    expect(deal.title).toBe('New Enterprise Deal');

    // Verify the POST call was made with JSON body
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/v1/deals');
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('get-person returns person data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              id: 7,
              name: 'Jane Smith',
              email: [{ value: 'jane@example.com', primary: true }],
              phone: [{ value: '+1234567890', primary: true }],
              org_id: 3,
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-person', { personId: 7 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const resultData = result.result as Record<string, unknown>;
    expect(resultData.success).toBe(true);
    const person = resultData.data as Record<string, unknown>;
    expect(person.id).toBe(7);
    expect(person.name).toBe('Jane Smith');
  });

  it('API error returns failure with Pipedrive error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () =>
          Promise.resolve({
            success: false,
            error: 'unauthorized access',
            error_info: 'Please check your API token.',
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-deals', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('PIPEDRIVE_ERROR');
    expect(error.message as string).toContain('401');
  });

  it('create-note sends POST with content and deal_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            id: 99,
            content: '<p>Follow up on proposal</p>',
            deal_id: 42,
            person_id: null,
            org_id: null,
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-note', {
      content: '<p>Follow up on proposal</p>',
      deal_id: 42,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const resultData = result.result as Record<string, unknown>;
    expect(resultData.success).toBe(true);
    const note = resultData.data as Record<string, unknown>;
    expect(note.id).toBe(99);
    expect(note.content).toBe('<p>Follow up on proposal</p>');
    expect(note.deal_id).toBe(42);

    // Verify the POST call was made with JSON body
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/v1/notes');
    const body = JSON.parse(opts.body as string);
    expect(body.content).toBe('<p>Follow up on proposal</p>');
    expect(body.deal_id).toBe(42);
  });
});
