/**
 * Tests for the Perplexity AI Agent App.
 *
 * Mocks the Perplexity API so tests run without real credentials.
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
    installationId: 'inst_perplexity',
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
    context: { userId: 'u_test', installationId: 'inst_perplexity' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Mock Perplexity API
// ---------------------------------------------------------------------------

function mockPerplexityResponse(answer: string, citations: string[] = []) {
  return {
    id: 'chatcmpl-test',
    model: 'sonar',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: answer },
        finish_reason: 'stop',
      },
    ],
    citations,
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPerplexityResponse('default answer')),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.perplexity',
    appVersion: '1.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  // Host-side callback handler: secrets requests.
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
        secrets: { APIKEY: 'test-api-key-123' },
      } as MessageBase);
      return;
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

describe('Perplexity AI Agent App', () => {
  it('lists search and chat tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual(['chat', 'search']);
  });

  it('health check reports ready with API key', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('search returns answer with citations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            mockPerplexityResponse('TypeScript is a typed superset of JavaScript.', [
              'https://typescriptlang.org',
              'https://wikipedia.org/wiki/TypeScript',
            ]),
          ),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search', { query: 'What is TypeScript?' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.answer).toBe('TypeScript is a typed superset of JavaScript.');
    expect(data.citations).toEqual([
      'https://typescriptlang.org',
      'https://wikipedia.org/wiki/TypeScript',
    ]);
    expect(data.formatted as string).toContain('[1] https://typescriptlang.org');
    expect(data.formatted as string).toContain('[2] https://wikipedia.org/wiki/TypeScript');
  });

  it('chat sends multi-turn messages with correct model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPerplexityResponse('Madrid is the capital of Spain.')),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'chat', {
      messages: [
        { role: 'system', content: 'You are a geography expert.' },
        { role: 'user', content: 'What is the capital of Spain?' },
      ],
      model: 'sonar-pro',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.answer).toBe('Madrid is the capital of Spain.');
    expect(data.model).toBe('sonar-pro');

    // Verify the fetch was called with correct model and messages
    const fetchCall = fetchMock.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.model).toBe('sonar-pro');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
  });

  it('search fails gracefully on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search', { query: 'test query' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('429');
  });
});
