/**
 * Tests for the Kelify Agent App.
 *
 * Mocks the Kelify API so tests run without real credentials.
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
    installationId: 'inst_kelify',
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
    context: { userId: 'u_test', installationId: 'inst_kelify' },
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
      headers: new Headers(),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.kelify',
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
        secrets: { KELIFY_API_KEY: 'test-kelify-key' },
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

describe('Kelify Agent App', () => {
  it('lists all 3 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'create-conversation',
      'get-conversation',
      'send-message',
    ]);
  });

  it('health check completes with valid API key', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The Kelify health handler returns { status: 'ready' } when the API key is
    // present and valid. The SDK correctly reports 'ready'.
    expect(health.status).toBe('ready');
    expect(health.version).toBe('2.0.0');
  });

  it('create-conversation returns a conversation id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              conversation_id: 'conv_abc123',
              created_at: '2026-07-31T10:00:00Z',
            }),
          ),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-conversation', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.conversation_id).toBe('conv_abc123');
    expect(data.created_at).toBe('2026-07-31T10:00:00Z');
  });

  it('send-message returns AI response with search results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              conversation_id: 'conv_abc123',
              title: 'Property search in Madrid',
              message: {
                role: 'assistant',
                content: 'I found 3 apartments in Madrid.',
                timestamp: '2026-07-31T10:01:00Z',
              },
              search_results: {
                count: 3,
                properties: [
                  {
                    id: 'p1',
                    title: '2BR Apartment in Sol',
                    price: 1200,
                    operation: 'rent',
                    home_type: 'apartment',
                    rooms: 2,
                    photos: ['https://example.com/p1.jpg'],
                    url: 'https://example.com/p1',
                  },
                ],
                search_params: { location: 'Madrid', operation: 'rent' },
              },
              usage: { input_tokens: 50, output_tokens: 100, total_tokens: 150 },
            }),
          ),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'send-message', {
      conversation_id: 'conv_abc123',
      message: 'Show me apartments in Madrid for rent',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.conversation_id).toBe('conv_abc123');
    expect(data.title).toBe('Property search in Madrid');

    const msg = data.message as Record<string, unknown>;
    expect(msg.role).toBe('assistant');
    expect(msg.content).toContain('3 apartments');

    const searchResults = data.search_results as Record<string, unknown>;
    expect(searchResults.count).toBe(3);

    const usage = data.usage as Record<string, unknown>;
    expect(usage.total_tokens).toBe(150);
  });

  it('get-conversation returns full conversation history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              conversation_id: 'conv_abc123',
              created_at: '2026-07-31T10:00:00Z',
              updated_at: '2026-07-31T10:05:00Z',
              title: 'Madrid apartments',
              messages: [
                { role: 'user', content: 'Show me apartments', timestamp: '2026-07-31T10:01:00Z' },
                {
                  role: 'assistant',
                  content: 'Here are 3 options.',
                  timestamp: '2026-07-31T10:01:01Z',
                },
              ],
              usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
            }),
          ),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-conversation', { conversation_id: 'conv_abc123' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.conversation_id).toBe('conv_abc123');
    expect(data.title).toBe('Madrid apartments');
    const messages = data.messages as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('health check reports ready even when API key is missing', async () => {
    // Override to return no secrets — credential validation is deferred to tool calls
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
          secrets: {},
        } as MessageBase);
      }
    });

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('send-message fails on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: 'Invalid API key' })),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'send-message', {
      conversation_id: 'conv_abc123',
      message: 'test query',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('AUTH_INVALID');
  });
});
