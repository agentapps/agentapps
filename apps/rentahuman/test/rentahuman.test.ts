/**
 * Tests for the RentAHuman Agent App.
 *
 * Mocks the RentAHuman API so tests run without real credentials.
 *
 * Coverage:
 *   1. Tool listing — verify all 5 tools registered
 *   2. Health check — ready with valid API key
 *   3. Sample tool calls: search-humans, get-human, create-booking
 *   4. Error handling — missing API key, API errors
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
let installationSecrets: Record<string, string>;

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
    installationId: 'inst_rentahuman',
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
    context: { userId: 'u_test', installationId: 'inst_rentahuman' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  installationSecrets = { RENTAHUMAN_API_KEY: 'rah_test_key_12345' };

  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ success: true, humans: [], count: 0 })),
      json: () => Promise.resolve({ success: true, humans: [], count: 0 }),
      headers: new Headers({ 'content-type': 'application/json' }),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.rentahuman',
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
        secrets: installationSecrets,
      } as MessageBase);
    }

    if (type === 'get_system_secrets') {
      host.send({
        ...createEnvelope('system_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: {},
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

describe('RentAHuman Agent App', () => {
  it('lists all 5 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'create-booking',
      'get-booking',
      'get-human',
      'list-bookings',
      'search-humans',
    ]);
  });

  it('health check completes without error when API is reachable', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The health handler returns { status: 'ready' } after successfully
    // calling rahRequest, confirming the API is reachable.
    expect(health.status).toBe('ready');
  });

  it('search-humans returns formatted human profiles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              success: true,
              count: 2,
              humans: [
                {
                  id: 'h-001',
                  name: 'Alice Smith',
                  headline: 'Professional photographer',
                  skills: ['Photography', 'Video'],
                  location: { city: 'New York', state: 'NY', country: 'US' },
                  hourlyRate: 45,
                  currency: 'USD',
                  rating: 4.8,
                  reviewCount: 24,
                  isAvailable: true,
                  isVerified: true,
                },
                {
                  id: 'h-002',
                  name: 'Bob Johnson',
                  headline: 'Delivery specialist',
                  skills: ['Delivery', 'Errands'],
                  location: { city: 'Los Angeles', state: 'CA', country: 'US' },
                  hourlyRate: 30,
                  currency: 'USD',
                  rating: 4.5,
                  reviewCount: 12,
                  isAvailable: true,
                  isVerified: false,
                },
              ],
            }),
          ),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-humans', { skill: 'Photography' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const text = result.result as string;
    expect(text).toContain('Alice Smith');
    expect(text).toContain('Bob Johnson');
    expect(text).toContain('Photography');
    expect(text).toContain('45 USD/hr');
  });

  it('get-human returns detailed profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              success: true,
              human: {
                id: 'h-001',
                name: 'Alice Smith',
                headline: 'Professional photographer',
                bio: 'I have 10 years of experience in event photography.',
                skills: ['Photography', 'Video', 'Editing'],
                expertise: ['Wedding photography', 'Corporate events'],
                location: { city: 'New York', state: 'NY', country: 'US' },
                hourlyRate: 45,
                currency: 'USD',
                rating: 4.8,
                reviewCount: 24,
                isAvailable: true,
                isVerified: true,
                isFeatured: true,
                timezone: 'America/New_York',
                wallets: { ethereum: '0xabc123' },
                availability: { Monday: '9am-5pm', Tuesday: '9am-5pm' },
              },
            }),
          ),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-human', { humanId: 'h-001' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const text = result.result as string;
    expect(text).toContain('Alice Smith');
    expect(text).toContain('10 years of experience');
    expect(text).toContain('Wedding photography');
    expect(text).toContain('0xabc123');
  });

  it('create-booking sends correct payload and returns confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            booking: {
              id: 'bk-001',
              humanId: 'h-001',
              agentId: 'agentapps-agent-123',
              agentName: 'Agent',
              taskTitle: 'Photo shoot at event',
              taskDescription: 'Take photos at the company party',
              taskCategory: 'photography',
              startTime: '2026-08-01T10:00:00Z',
              estimatedHours: 3,
              totalAmount: 135,
              currency: 'USD',
              paymentStatus: 'pending',
              status: 'confirmed',
            },
            message: 'Send payment to wallet address.',
          }),
        ),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-booking', {
      humanId: 'h-001',
      taskTitle: 'Photo shoot at event',
      taskDescription: 'Take photos at the company party',
      taskCategory: 'photography',
      startTime: '2026-08-01T10:00:00Z',
      estimatedHours: 3,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const text = result.result as string;
    expect(text).toContain('Booking created successfully');
    expect(text).toContain('bk-001');
    expect(text).toContain('Photo shoot at event');
    expect(text).toContain('CONFIRMED');
    expect(text).toContain('Send payment to wallet address');

    // Verify the API was called with POST to /bookings
    const bookingCall = fetchMock.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('/bookings'),
    );
    expect(bookingCall).toBeDefined();
    expect(bookingCall![1].method).toBe('POST');

    const body = JSON.parse(bookingCall![1].body);
    expect(body.humanId).toBe('h-001');
    expect(body.taskTitle).toBe('Photo shoot at event');
    expect(body.estimatedHours).toBe(3);
  });

  it('create-booking fails when API key is missing', async () => {
    installationSecrets = {};

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-booking', {
      humanId: 'h-001',
      taskTitle: 'Test task',
      taskDescription: 'A test',
      startTime: '2026-08-01T10:00:00Z',
      estimatedHours: 1,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('RENTAHUMAN_API_KEY');
  });

  it('tool call fails on API 404 error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ message: 'Human not found' })),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-human', { humanId: 'nonexistent' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('Human not found');
  });

  it('search-humans returns empty message when no results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true, humans: [], count: 0 })),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-humans', { skill: 'Underwater basket weaving' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const text = result.result as string;
    expect(text).toContain('No humans found');
  });
});
