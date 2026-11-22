/**
 * Tests for the Twilio Agent App.
 *
 * Mocks the Twilio API so tests run without real credentials.
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
    installationId: 'inst_twilio',
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
    context: { userId: 'u_test', installationId: 'inst_twilio' },
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
    appId: 'app.twilio',
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
        secrets: { ACCOUNT_SID: 'AC_test_fake123', AUTH_TOKEN: 'auth_test_fake456' },
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

describe('Twilio Agent App', () => {
  it('lists all 13 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'get-account',
      'get-call',
      'get-message',
      'get-recording',
      'list-available-numbers',
      'list-calls',
      'list-messages',
      'list-phone-numbers',
      'list-recordings',
      'lookup-phone',
      'make-call',
      'send-sms',
      'send-whatsapp',
    ]);
  });

  it('health check reports ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sid: 'AC_test_fake123',
            friendly_name: 'Test Account',
            status: 'active',
            type: 'Full',
          }),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('send-sms sends correct form-urlencoded body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sid: 'SM_test123',
          status: 'queued',
          to: '+14155551234',
          from: '+14155559876',
          body: 'Hello from Twilio!',
          date_sent: null,
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'send-sms', {
      to: '+14155551234',
      from: '+14155559876',
      body: 'Hello from Twilio!',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.sid).toBe('SM_test123');
    expect(data.status).toBe('queued');

    // Verify the POST call used form-urlencoded with correct params
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/Messages.json');
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = opts.body as string;
    expect(body).toContain('To=%2B14155551234');
    expect(body).toContain('From=%2B14155559876');
    expect(body).toContain('Body=Hello+from+Twilio%21');
  });

  it('list-messages returns messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            messages: [
              { sid: 'SM_abc', to: '+1111', from: '+2222', body: 'Hi', status: 'delivered' },
              { sid: 'SM_def', to: '+3333', from: '+4444', body: 'Hey', status: 'sent' },
            ],
            page: 0,
            page_size: 20,
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-messages', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.messages as Array<Record<string, unknown>>).toHaveLength(2);
    expect(data.pageSize).toBe(20);
  });

  it('get-account returns account info', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sid: 'AC_test_fake123',
            friendly_name: 'My Twilio Account',
            status: 'active',
            type: 'Full',
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-account', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.sid).toBe('AC_test_fake123');
    expect(data.friendly_name).toBe('My Twilio Account');
    expect(data.status).toBe('active');
    expect(data.type).toBe('Full');
  });

  it('list-calls returns calls with filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          calls: [
            {
              sid: 'CA_abc123',
              to: '+14155551234',
              from: '+14155559876',
              status: 'completed',
              direction: 'outbound-api',
              duration: '42',
            },
            {
              sid: 'CA_def456',
              to: '+14155551234',
              from: '+14155559876',
              status: 'completed',
              direction: 'outbound-api',
              duration: '15',
            },
          ],
          page: 0,
          page_size: 20,
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-calls', { status: 'completed', pageSize: 20 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.calls as Array<Record<string, unknown>>).toHaveLength(2);
    expect(data.pageSize).toBe(20);

    // Verify the GET call included the Status filter
    const getCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const url = call[0] as string;
      return url.includes('/Calls.json');
    });
    expect(getCall).toBeDefined();
    const url = getCall![0] as string;
    expect(url).toContain('Status=completed');
  });

  it('API error returns failure with TWILIO_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () =>
          Promise.resolve({
            code: 20003,
            message: 'Authenticate',
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-account', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('TWILIO_ERROR');
    expect(error.message as string).toContain('401');
  });
});
