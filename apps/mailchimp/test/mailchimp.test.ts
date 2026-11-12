/**
 * Integration tests for the Mailchimp Agent App.
 *
 * Uses InProcessRuntime + AppStation to spin up the app in-process. Mocks
 * global `fetch` so tests run without real Mailchimp credentials.
 *
 * Covers: tool listing, health check, list-audiences, add-subscriber,
 * list-campaigns, and API error propagation.
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
    installationId: 'inst_mailchimp',
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
    context: { userId: 'u_test', installationId: 'inst_mailchimp' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a real Response like fetch returns. */
function res(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  const hasBody = body !== undefined && status !== 204;
  return new Response(hasBody ? JSON.stringify(body) : null, {
    status,
    headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...headers },
  });
}

/** Queue responses; each call returns the next (clone), repeating the last. */
function stubFetch(...responses: Response[]) {
  let i = 0;
  const f = vi.fn(async () => responses[Math.min(i++, responses.length - 1)].clone());
  vi.stubGlobal('fetch', f);
  return f;
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
    appId: 'app.mailchimp',
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
        secrets: { API_KEY: 'fake-api-key-us21' },
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

describe('Mailchimp Agent App — tool listing', () => {
  it('lists all 18 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools).toHaveLength(18);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'add-subscriber',
      'create-campaign',
      'create-segment',
      'delete-subscriber',
      'get-audience',
      'get-campaign',
      'get-campaign-report',
      'get-template',
      'list-audiences',
      'list-automations',
      'list-campaigns',
      'list-merge-fields',
      'list-segments',
      'list-subscribers',
      'list-tags',
      'list-templates',
      'send-campaign',
      'update-subscriber',
    ]);
  });
});

describe('Mailchimp Agent App — health check', () => {
  it('reports ready when API key is valid', async () => {
    stubFetch(res(200, { health_status: "Everything's Chimpy!" }));

    const sessionId = await initAndOpen();

    received.length = 0;
    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });
});

describe('Mailchimp Agent App — list-audiences', () => {
  it('returns shaped audiences', async () => {
    stubFetch(
      res(200, {
        lists: [
          {
            id: 'abc123',
            name: 'Newsletter',
            stats: { member_count: 1500 },
            date_created: '2025-01-01T00:00:00+00:00',
            list_rating: 3,
          },
        ],
        total_items: 1,
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-audiences', { count: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    const audiences = data.audiences as Array<Record<string, unknown>>;
    expect(audiences).toHaveLength(1);
    expect(audiences[0].name).toBe('Newsletter');
    expect(audiences[0].id).toBe('abc123');
  });
});

describe('Mailchimp Agent App — add-subscriber', () => {
  it('adds a subscriber successfully', async () => {
    stubFetch(
      res(200, {
        id: 'sub123',
        email_address: 'john@example.com',
        status: 'subscribed',
        merge_fields: { FNAME: 'John' },
        list_id: 'abc123',
        unique_email_id: 'uid123',
        timestamp_signup: '2025-06-01T12:00:00+00:00',
        last_changed: '2025-06-01T12:00:00+00:00',
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-subscriber', {
      listId: 'abc123',
      email_address: 'john@example.com',
      status: 'subscribed',
      merge_fields: { FNAME: 'John' },
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    expect(data.email_address).toBe('john@example.com');
    expect(data.status).toBe('subscribed');
  });
});

describe('Mailchimp Agent App — list-campaigns', () => {
  it('returns shaped campaigns', async () => {
    stubFetch(
      res(200, {
        campaigns: [
          {
            id: 'camp123',
            type: 'regular',
            status: 'sent',
            emails_sent: 500,
            send_time: '2025-06-01T12:00:00+00:00',
            settings: { subject_line: 'Big Promo', from_name: 'Store' },
            recipients: { list_id: 'abc123' },
            create_time: '2025-05-30T10:00:00+00:00',
          },
        ],
        total_items: 1,
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-campaigns', { count: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    const campaigns = data.campaigns as Array<Record<string, unknown>>;
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].status).toBe('sent');
    expect(campaigns[0].emails_sent).toBe(500);
  });
});

describe('Mailchimp Agent App — get-campaign-report', () => {
  it('returns a shaped campaign report', async () => {
    stubFetch(
      res(200, {
        id: 'camp123',
        campaign_title: 'Big Promo',
        type: 'regular',
        list_id: 'abc123',
        list_name: 'Newsletter',
        subject_line: 'Check this out',
        emails_sent: 500,
        abuse_reports: 0,
        unsubscribed: 2,
        send_time: '2025-06-01T12:00:00+00:00',
        opens: { opens_total: 250, unique_opens: 200, open_rate: 0.4 },
        clicks: { clicks_total: 80, unique_clicks: 60, click_rate: 0.12 },
        bounces: { hard_bounces: 3, soft_bounces: 5 },
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-campaign-report', { campaignId: 'camp123' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('camp123');
    expect(data.campaign_title).toBe('Big Promo');
    expect(data.emails_sent).toBe(500);
    expect(data.opens).toBeTruthy();
    expect((data.opens as Record<string, unknown>).unique_opens).toBe(200);
    expect(data.clicks).toBeTruthy();
    expect((data.clicks as Record<string, unknown>).click_rate).toBe(0.12);
  });
});

describe('Mailchimp Agent App — API error propagation', () => {
  it('propagates a 401 as an error result with AUTH_INVALID', async () => {
    stubFetch(
      res(401, {
        title: 'API Key Invalid',
        detail:
          'Your API key may be invalid, or you have attempted to access the wrong datacenter.',
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-audiences', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toMatch(/MAILCHIMP_ERROR/);
    expect(error.message as string).toMatch(/AUTH_INVALID/);
  });
});
