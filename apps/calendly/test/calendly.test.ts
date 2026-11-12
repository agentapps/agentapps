/**
 * Tests for the Calendly Agent App.
 *
 * Mocks the Calendly API so tests run without real credentials.
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
    installationId: 'inst_calendly',
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
    context: { userId: 'u_test', installationId: 'inst_calendly' },
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
    appId: 'app.calendly',
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
        secrets: {
          ACCESS_TOKEN: 'test-calendly-token',
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

describe('Calendly Agent App', () => {
  it('lists all 13 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'cancel-event',
      'create-webhook-subscription',
      'delete-webhook-subscription',
      'get-current-user',
      'get-event-type',
      'get-invitee',
      'get-scheduled-event',
      'list-availability-schedules',
      'list-event-types',
      'list-invitees',
      'list-routing-forms',
      'list-scheduled-events',
      'list-webhook-subscriptions',
    ]);
  });

  it('health check reports ready with valid token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            resource: {
              uri: 'https://api.calendly.com/users/AAAA',
              name: 'Test User',
              email: 'test@example.com',
            },
          }),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              resource: { uri: 'https://api.calendly.com/users/AAAA', name: 'Test User' },
            }),
          ),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('get-current-user returns user data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            resource: {
              uri: 'https://api.calendly.com/users/AAAA',
              name: 'Test User',
              email: 'test@example.com',
              scheduling_url: 'https://calendly.com/test-user',
              timezone: 'America/New_York',
            },
          }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-current-user', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const user = data.user as Record<string, unknown>;
    expect(user.name).toBe('Test User');
    expect(user.email).toBe('test@example.com');
    expect(user.scheduling_url).toBe('https://calendly.com/test-user');
  });

  it('list-event-types returns event types', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            collection: [
              {
                uri: 'https://api.calendly.com/event_types/ET1',
                name: '30 Minute Meeting',
                slug: '30min',
                duration: 30,
                scheduling_url: 'https://calendly.com/test-user/30min',
              },
              {
                uri: 'https://api.calendly.com/event_types/ET2',
                name: '60 Minute Meeting',
                slug: '60min',
                duration: 60,
                scheduling_url: 'https://calendly.com/test-user/60min',
              },
            ],
            pagination: { count: 2, next_page: null },
          }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-event-types', {
      userUri: 'https://api.calendly.com/users/AAAA',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.count).toBe(2);
    const types = data.eventTypes as Array<Record<string, unknown>>;
    expect(types[0].name).toBe('30 Minute Meeting');
    expect(types[1].name).toBe('60 Minute Meeting');
  });

  it('list-scheduled-events returns events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            collection: [
              {
                uri: 'https://api.calendly.com/scheduled_events/SE1',
                name: 'Intro Call',
                status: 'active',
                start_time: '2026-08-01T10:00:00.000Z',
                end_time: '2026-08-01T10:30:00.000Z',
              },
            ],
            pagination: { count: 1, next_page: null },
          }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-scheduled-events', {
      userUri: 'https://api.calendly.com/users/AAAA',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.count).toBe(1);
    const events = data.events as Array<Record<string, unknown>>;
    expect(events[0].name).toBe('Intro Call');
    expect(events[0].status).toBe('active');
  });

  it('list-webhook-subscriptions returns subscriptions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            collection: [
              {
                uri: 'https://api.calendly.com/webhook_subscriptions/WH1',
                callback_url: 'https://example.com/webhook',
                state: 'active',
                events: ['invitee.created', 'invitee.canceled'],
                scope: 'organization',
                organization: 'https://api.calendly.com/organizations/ORG1',
                created_at: '2026-07-01T00:00:00.000Z',
                updated_at: '2026-07-01T00:00:00.000Z',
              },
            ],
            pagination: { count: 1, next_page: null },
          }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-webhook-subscriptions', {
      organizationUri: 'https://api.calendly.com/organizations/ORG1',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.count).toBe(1);
    const subscriptions = data.webhookSubscriptions as Array<Record<string, unknown>>;
    expect(subscriptions[0].callback_url).toBe('https://example.com/webhook');
    expect(subscriptions[0].state).toBe('active');
  });

  it('tool call fails on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('{"title": "Unauthenticated", "message": "Invalid token"}'),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-current-user', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('401');
  });
});
