/**
 * Integration tests for the Google Calendar Agent App.
 *
 * Mocks the host-side auth/secrets callbacks and the Google Calendar API
 * so the test runs fully offline while exercising the real OAuth flow logic.
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
import factory from '../src/app.js';
import { stopPolling } from '../src/polling.js';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let appStation: AppStation;
let host: Transport;
let received: MessageBase[];
let systemSecrets: Record<string, string>;
let installationSecrets: Record<string, string>;
let googleResponses: Map<string, Response[]>;
let fetchCalls: { url: string; options?: RequestInit }[];

function setResponse(url: string, response: Response): void {
  const existing = googleResponses.get(url) ?? [];
  existing.push(response);
  googleResponses.set(url, existing);
}

function setResponses(url: string, responses: Response[]): void {
  const existing = googleResponses.get(url) ?? [];
  googleResponses.set(url, [...existing, ...responses]);
}

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
  throw new Error(`Timeout waiting for message`);
}

async function waitForType(type: string, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return waitFor((m) => m.type === type, timeoutMs);
}

async function initAndOpen(): Promise<string> {
  host.send({
    ...createEnvelope('initialize'),
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'test', version: '1.0.0' },
    capabilities: { directConnection: false, push: true },
  } as MessageBase);
  await waitForType('initialized');

  received.length = 0;
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'inst_google_calendar',
    tenant: { userId: 'u_test' },
  } as MessageBase);
  const opened = await waitForType('session_opened');
  received.length = 0;
  return opened.sessionId as string;
}

async function subscribeToCalendarUpdated(sessionId: string): Promise<string> {
  host.send({
    ...createEnvelope('subscribe', sessionId),
    eventTypes: ['calendar_updated'],
  } as MessageBase);
  const subResult = await waitForType('subscribe_result');
  expect(subResult.success).toBe(true);
  return subResult.subscriptionId as string;
}

function sendToolCall(sessionId: string, tool: string, args: Record<string, unknown>): void {
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool,
    arguments: args,
    context: { userId: 'u_test', installationId: 'inst_google_calendar' },
  } as MessageBase);
}

beforeEach(() => {
  systemSecrets = { CLIENT_ID: 'test-client-id', CLIENT_SECRET: 'test-client-secret' };
  installationSecrets = {};
  googleResponses = new Map();
  fetchCalls = [];

  // Mock global fetch for Google API calls (refresh + calendar API).
  // Supports multiple responses per URL by storing them in an array and
  // consuming the first matching entry in insertion order.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      fetchCalls.push({ url, options: init });
      for (const [key, queue] of googleResponses.entries()) {
        if (url.startsWith(key) && queue.length > 0) {
          return queue.shift()!;
        }
      }
      return new Response('Not mocked', { status: 500 });
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.google.calendar',
    appVersion: '1.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  // Host-side callback handler: secrets + auth + open_url callbacks.
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
        secrets: systemSecrets,
      } as MessageBase);
      return;
    }

    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: installationSecrets,
      } as MessageBase);
      return;
    }

    if (type === 'update_installation_secrets') {
      const secrets = m.secrets as Record<string, string>;
      Object.assign(installationSecrets, secrets);
      host.send({
        ...createEnvelope('update_installation_secrets_response', sessionId),
        id: requestId,
        requestId,
        success: true,
      } as MessageBase);
      return;
    }

    if (type === 'refresh_token') {
      // Simulate the host's onRefreshToken: exchange the refresh token and
      // persist the new credentials (Path B — the host owns refresh).
      const accessToken = 'new-access-789';
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      installationSecrets.ACCESS_TOKEN = accessToken;
      installationSecrets.expiresAt = expiresAt;
      host.send({
        ...createEnvelope('refresh_token_response', sessionId),
        id: requestId,
        requestId,
        accessToken,
        refreshToken: installationSecrets.REFRESH_TOKEN,
        expiresAt,
      } as MessageBase);
      return;
    }

    if (type === 'prompt' && m.promptType === 'auth') {
      // Simulate the host completing OAuth and returning tokens to the app.
      host.send({
        ...createEnvelope('prompt_result', sessionId),
        promptId: m.promptId as string,
        success: true,
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      } as MessageBase);
      return;
    }

    if (type === 'prompt' && m.promptType === 'url') {
      host.send({
        ...createEnvelope('prompt_result', sessionId),
        promptId: m.promptId as string,
        success: true,
      } as MessageBase);
      return;
    }
  });

  appStation.accept(ctrlSide);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await appStation.shutdown();
  stopPolling();
  delete process.env.GOOGLE_CALENDAR_POLL_INTERVAL_MS;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Google Calendar', () => {
  it('lists all registered tools', async () => {
    const sessionId = await initAndOpen();

    host.send({
      ...createEnvelope('list_tools'),
      sessionId,
    } as MessageBase);
    const list = await waitForType('tools_list');
    const tools = list.tools as Array<Record<string, unknown>>;

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'authenticate',
      'create-calendar',
      'create-event',
      'delete-event',
      'get-event',
      'get-freebusy',
      'list-calendars',
      'list-events',
      'move-event',
      'open-calendar',
      'quick-add-event',
      'update-event',
    ]);
  });

  it('health check reports not_ready when system secrets are missing', async () => {
    systemSecrets = {};
    const sessionId = await initAndOpen();

    host.send({
      ...createEnvelope('health_check'),
      sessionId,
    } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('not_ready');
    expect((health.message as string).toLowerCase()).toContain('missing');
  });

  it('health check reports ready when system secrets are present', async () => {
    const sessionId = await initAndOpen();

    host.send({
      ...createEnvelope('health_check'),
      sessionId,
    } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('list-events triggers OAuth and calls Google Calendar API', async () => {
    const sessionId = await initAndOpen();

    setResponse(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'evt-1',
              summary: 'Team standup',
              start: { dateTime: '2026-06-23T10:00:00Z' },
              end: { dateTime: '2026-06-23T10:30:00Z' },
              htmlLink: 'https://calendar.google.com/event?eid=evt-1',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    sendToolCall(sessionId, 'list-events', { maxResults: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const events = (result.result as Record<string, unknown>).events as Array<
      Record<string, unknown>
    >;
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe('Team standup');

    // Verify tokens were persisted
    expect(installationSecrets.ACCESS_TOKEN).toBe('access-123');
    expect(installationSecrets.REFRESH_TOKEN).toBe('refresh-456');
    expect(Number(installationSecrets.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('get-event retrieves a single event by ID', async () => {
    const sessionId = await initAndOpen();
    installationSecrets = {
      ACCESS_TOKEN: 'access-123',
      REFRESH_TOKEN: 'refresh-456',
      expiresAt: String(Date.now() + 3600 * 1000),
    };

    setResponse(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/evt-1',
      new Response(
        JSON.stringify({
          id: 'evt-1',
          summary: 'One-on-one',
          start: { dateTime: '2026-06-23T11:00:00Z' },
          end: { dateTime: '2026-06-23T11:30:00Z' },
          htmlLink: 'https://calendar.google.com/event?eid=evt-1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    sendToolCall(sessionId, 'get-event', { eventId: 'evt-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const event = (result.result as Record<string, unknown>).event as Record<string, unknown>;
    expect(event.summary).toBe('One-on-one');
  });

  it('create-event calls Google Calendar API and emits calendar_updated', async () => {
    const sessionId = await initAndOpen();
    installationSecrets = {
      ACCESS_TOKEN: 'access-123',
      REFRESH_TOKEN: 'refresh-456',
      expiresAt: String(Date.now() + 3600 * 1000),
    };

    const subscriptionId = await subscribeToCalendarUpdated(sessionId);

    setResponse(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      new Response(
        JSON.stringify({
          id: 'evt-new',
          summary: 'Demo meeting',
          start: { dateTime: '2026-06-23T14:00:00Z' },
          end: { dateTime: '2026-06-23T15:00:00Z' },
          htmlLink: 'https://calendar.google.com/event?eid=evt-new',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    sendToolCall(sessionId, 'create-event', {
      summary: 'Demo meeting',
      startTime: '2026-06-23T14:00:00Z',
      endTime: '2026-06-23T15:00:00Z',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const event = (result.result as Record<string, unknown>).event as Record<string, unknown>;
    expect(event.summary).toBe('Demo meeting');

    const eventMsg = await waitFor(
      (m) =>
        m.type === 'event' &&
        m.subscriptionId === subscriptionId &&
        m.eventType === 'calendar_updated',
    );
    expect((eventMsg.payload as Record<string, unknown>).action).toBe('created');
  });

  it('update-event calls Google Calendar API and emits calendar_updated', async () => {
    const sessionId = await initAndOpen();
    installationSecrets = {
      ACCESS_TOKEN: 'access-123',
      REFRESH_TOKEN: 'refresh-456',
      expiresAt: String(Date.now() + 3600 * 1000),
    };

    const subscriptionId = await subscribeToCalendarUpdated(sessionId);

    setResponses('https://www.googleapis.com/calendar/v3/calendars/primary/events/evt-1', [
      new Response(
        JSON.stringify({
          id: 'evt-1',
          summary: 'Old title',
          start: { dateTime: '2026-06-23T10:00:00Z' },
          end: { dateTime: '2026-06-23T11:00:00Z' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
      new Response(
        JSON.stringify({
          id: 'evt-1',
          summary: 'Updated title',
          start: { dateTime: '2026-06-23T10:00:00Z' },
          end: { dateTime: '2026-06-23T11:00:00Z' },
          htmlLink: 'https://calendar.google.com/event?eid=evt-1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ]);

    sendToolCall(sessionId, 'update-event', { eventId: 'evt-1', summary: 'Updated title' });

    const result = await waitForType('tool_result');
    if (!result.success) {
      // Surface the underlying error so we can diagnose the failure quickly.
      expect(result.error).toBeUndefined();
    }
    expect(result.success).toBe(true);

    const event = (result.result as Record<string, unknown>).event as Record<string, unknown>;
    expect(event.summary).toBe('Updated title');

    // Ensure we issued the GET + PUT pair in the right order.
    const calendarCalls = fetchCalls.filter((c) =>
      c.url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events/evt-1'),
    );
    expect(calendarCalls).toHaveLength(2);
    expect(calendarCalls[0].options?.method).toBe('GET');
    expect(calendarCalls[1].options?.method).toBe('PUT');

    const eventMsg = await waitFor(
      (m) =>
        m.type === 'event' &&
        m.subscriptionId === subscriptionId &&
        m.eventType === 'calendar_updated',
    );
    expect((eventMsg.payload as Record<string, unknown>).action).toBe('updated');
  });

  it('delete-event calls Google Calendar API and emits calendar_updated', async () => {
    const sessionId = await initAndOpen();
    installationSecrets = {
      ACCESS_TOKEN: 'access-123',
      REFRESH_TOKEN: 'refresh-456',
      expiresAt: String(Date.now() + 3600 * 1000),
    };

    const subscriptionId = await subscribeToCalendarUpdated(sessionId);

    setResponse(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/evt-1',
      new Response(null, { status: 204 }),
    );

    sendToolCall(sessionId, 'delete-event', { eventId: 'evt-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const success = (result.result as Record<string, unknown>).success;
    expect(success).toBe(true);

    const eventMsg = await waitFor(
      (m) =>
        m.type === 'event' &&
        m.subscriptionId === subscriptionId &&
        m.eventType === 'calendar_updated',
    );
    expect((eventMsg.payload as Record<string, unknown>).action).toBe('deleted');
  });

  it('list-calendars returns available calendars', async () => {
    const sessionId = await initAndOpen();
    installationSecrets = {
      ACCESS_TOKEN: 'access-123',
      REFRESH_TOKEN: 'refresh-456',
      expiresAt: String(Date.now() + 3600 * 1000),
    };

    setResponse(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      new Response(
        JSON.stringify({
          items: [
            { id: 'primary', summary: 'Primary', primary: true, timeZone: 'Europe/Madrid' },
            { id: 'work', summary: 'Work', timeZone: 'UTC' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    sendToolCall(sessionId, 'list-calendars', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const calendars = (result.result as Record<string, unknown>).calendars as Array<
      Record<string, unknown>
    >;
    expect(calendars).toHaveLength(2);
    expect(calendars[0].summary).toBe('Primary');
  });

  it('authenticate triggers OAuth and persists tokens', async () => {
    const sessionId = await initAndOpen();

    sendToolCall(sessionId, 'authenticate', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const auth = result.result as Record<string, unknown>;
    expect(auth.authenticated).toBe(true);
    expect(auth.provider).toBe('google');
    expect(installationSecrets.ACCESS_TOKEN).toBe('access-123');
    expect(installationSecrets.REFRESH_TOKEN).toBe('refresh-456');
  });

  it('open-calendar opens the browser', async () => {
    const sessionId = await initAndOpen();
    installationSecrets = {
      ACCESS_TOKEN: 'access-123',
      REFRESH_TOKEN: 'refresh-456',
      expiresAt: String(Date.now() + 3600 * 1000),
    };

    sendToolCall(sessionId, 'open-calendar', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const res = result.result as Record<string, unknown>;
    expect(res.opened).toBe(true);
  });

  it('create-event refreshes an expired access token before calling API', async () => {
    const sessionId = await initAndOpen();

    // Pre-populate expired user tokens. The app asks the host to refresh
    // (ctx.auth.refresh → refresh_token callback), which the mock host handles
    // by minting 'new-access-789' and persisting it.
    installationSecrets = {
      ACCESS_TOKEN: 'expired-token',
      REFRESH_TOKEN: 'refresh-456',
      expiresAt: String(Date.now() - 1000),
    };

    setResponse(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      new Response(
        JSON.stringify({
          id: 'evt-new',
          summary: 'Demo meeting',
          start: { dateTime: '2026-06-23T14:00:00Z' },
          end: { dateTime: '2026-06-23T15:00:00Z' },
          htmlLink: 'https://calendar.google.com/event?eid=evt-new',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    sendToolCall(sessionId, 'create-event', {
      summary: 'Demo meeting',
      startTime: '2026-06-23T14:00:00Z',
      endTime: '2026-06-23T15:00:00Z',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const event = (result.result as Record<string, unknown>).event as Record<string, unknown>;
    expect(event.summary).toBe('Demo meeting');
    expect(installationSecrets.ACCESS_TOKEN).toBe('new-access-789');
    // The host persists expiresAt as an ISO 8601 timestamp.
    expect(Date.parse(installationSecrets.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('create-calendar creates a new calendar', async () => {
    const sessionId = await initAndOpen();
    installationSecrets = {
      ACCESS_TOKEN: 'access-123',
      REFRESH_TOKEN: 'refresh-456',
      expiresAt: String(Date.now() + 3600 * 1000),
    };

    setResponse(
      'https://www.googleapis.com/calendar/v3/calendars',
      new Response(
        JSON.stringify({
          id: 'new-cal-id',
          summary: 'Work Projects',
          description: 'Calendar for work projects',
          timeZone: 'America/New_York',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    sendToolCall(sessionId, 'create-calendar', {
      summary: 'Work Projects',
      description: 'Calendar for work projects',
      timeZone: 'America/New_York',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const calendar = (result.result as Record<string, unknown>).calendar as Record<string, unknown>;
    expect(calendar.id).toBe('new-cal-id');
    expect(calendar.summary).toBe('Work Projects');
    expect(calendar.description).toBe('Calendar for work projects');
    expect(calendar.timeZone).toBe('America/New_York');
  });

  it('get-freebusy queries free/busy information', async () => {
    const sessionId = await initAndOpen();
    installationSecrets = {
      ACCESS_TOKEN: 'access-123',
      REFRESH_TOKEN: 'refresh-456',
      expiresAt: String(Date.now() + 3600 * 1000),
    };

    setResponse(
      'https://www.googleapis.com/calendar/v3/freeBusy',
      new Response(
        JSON.stringify({
          kind: 'calendar#freeBusy',
          timeMin: '2026-06-23T00:00:00Z',
          timeMax: '2026-06-24T00:00:00Z',
          calendars: {
            primary: {
              busy: [
                { start: '2026-06-23T10:00:00Z', end: '2026-06-23T11:00:00Z' },
                { start: '2026-06-23T14:00:00Z', end: '2026-06-23T15:00:00Z' },
              ],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    sendToolCall(sessionId, 'get-freebusy', {
      timeMin: '2026-06-23T00:00:00Z',
      timeMax: '2026-06-24T00:00:00Z',
      items: [{ id: 'primary' }],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const res = result.result as Record<string, unknown>;
    expect(res.timeMin).toBe('2026-06-23T00:00:00Z');
    expect(res.timeMax).toBe('2026-06-24T00:00:00Z');
    const calendars = res.calendars as Record<string, { busy: unknown[] }>;
    expect(calendars.primary.busy).toHaveLength(2);
  });

  it('quick-add-event creates an event from text and emits calendar_updated', async () => {
    const sessionId = await initAndOpen();
    installationSecrets = {
      ACCESS_TOKEN: 'access-123',
      REFRESH_TOKEN: 'refresh-456',
      expiresAt: String(Date.now() + 3600 * 1000),
    };

    const subscriptionId = await subscribeToCalendarUpdated(sessionId);

    setResponse(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/quickAdd',
      new Response(
        JSON.stringify({
          id: 'evt-quick',
          summary: 'Lunch with Alice',
          start: { dateTime: '2026-06-24T12:00:00Z' },
          end: { dateTime: '2026-06-24T13:00:00Z' },
          htmlLink: 'https://calendar.google.com/event?eid=evt-quick',
          status: 'confirmed',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    sendToolCall(sessionId, 'quick-add-event', {
      text: 'Lunch with Alice tomorrow at noon',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const event = (result.result as Record<string, unknown>).event as Record<string, unknown>;
    expect(event.id).toBe('evt-quick');
    expect(event.summary).toBe('Lunch with Alice');

    const eventMsg = await waitFor(
      (m) =>
        m.type === 'event' &&
        m.subscriptionId === subscriptionId &&
        m.eventType === 'calendar_updated',
    );
    expect((eventMsg.payload as Record<string, unknown>).action).toBe('created');
  });

  it('move-event moves an event to another calendar and emits calendar_updated', async () => {
    const sessionId = await initAndOpen();
    installationSecrets = {
      ACCESS_TOKEN: 'access-123',
      REFRESH_TOKEN: 'refresh-456',
      expiresAt: String(Date.now() + 3600 * 1000),
    };

    const subscriptionId = await subscribeToCalendarUpdated(sessionId);

    setResponse(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/evt-1/move',
      new Response(
        JSON.stringify({
          id: 'evt-1',
          summary: 'Moved meeting',
          start: { dateTime: '2026-06-23T10:00:00Z' },
          end: { dateTime: '2026-06-23T11:00:00Z' },
          htmlLink: 'https://calendar.google.com/event?eid=evt-1',
          status: 'confirmed',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    sendToolCall(sessionId, 'move-event', {
      eventId: 'evt-1',
      destination: 'work-calendar-id',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const event = (result.result as Record<string, unknown>).event as Record<string, unknown>;
    expect(event.id).toBe('evt-1');
    expect(event.summary).toBe('Moved meeting');

    const eventMsg = await waitFor(
      (m) =>
        m.type === 'event' &&
        m.subscriptionId === subscriptionId &&
        m.eventType === 'calendar_updated',
    );
    expect((eventMsg.payload as Record<string, unknown>).action).toBe('moved');
  });

  it('polling detects external calendar changes and emits calendar_updated', async () => {
    const sessionId = await initAndOpen();
    installationSecrets = {
      ACCESS_TOKEN: 'access-123',
      REFRESH_TOKEN: 'refresh-456',
      expiresAt: String(Date.now() + 3600 * 1000),
    };

    // Short interval so the second poll runs quickly in the test.
    process.env.GOOGLE_CALENDAR_POLL_INTERVAL_MS = '50';

    // First poll: baseline with one existing event.
    // Second poll: a new event appears.
    setResponses('https://www.googleapis.com/calendar/v3/calendars/primary/events', [
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'evt-existing',
              summary: 'Existing',
              start: { dateTime: '2026-06-23T09:00:00Z' },
              end: { dateTime: '2026-06-23T10:00:00Z' },
              updated: '2026-06-23T08:00:00Z',
            },
          ],
          nextSyncToken: 'sync-token-1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'evt-existing',
              summary: 'Existing',
              start: { dateTime: '2026-06-23T09:00:00Z' },
              end: { dateTime: '2026-06-23T10:00:00Z' },
              updated: '2026-06-23T08:00:00Z',
            },
            {
              id: 'evt-new',
              summary: 'External meeting',
              start: { dateTime: '2026-06-23T11:00:00Z' },
              end: { dateTime: '2026-06-23T12:00:00Z' },
              updated: '2026-06-23T10:00:00Z',
            },
          ],
          nextSyncToken: 'sync-token-2',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ]);

    const subscriptionId = await subscribeToCalendarUpdated(sessionId);

    // Wait for the poller to baseline and then detect the new event.
    const eventMsg = await waitFor(
      (m) =>
        m.type === 'event' &&
        m.subscriptionId === subscriptionId &&
        m.eventType === 'calendar_updated',
      3000,
    );

    const payload = eventMsg.payload as Record<string, unknown>;
    expect(payload.kind).toBe('created');
    const events = payload.events as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('evt-new');
    expect(events[0].summary).toBe('External meeting');
  });
});
