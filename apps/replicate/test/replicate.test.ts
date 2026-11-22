/**
 * Tests for the Replicate Agent App.
 *
 * Mocks the Replicate API so tests run without real credentials.
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
    installationId: 'inst_replicate',
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
    context: { userId: 'u_test', installationId: 'inst_replicate' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Mock Replicate API responses
// ---------------------------------------------------------------------------

function mockModelResponse() {
  return {
    owner: 'black-forest-labs',
    name: 'flux-kontext-pro',
    description: 'Fast image generation with FLUX',
    url: 'https://replicate.com/black-forest-labs/flux-kontext-pro',
    run_count: 1000000,
    latest_version: {
      id: 'abc123',
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: 'Text prompt' },
              },
            },
          },
        },
      },
    },
  };
}

function mockPredictionResponse(status: string = 'starting', output: unknown = null) {
  return {
    id: 'pred_test123',
    model: 'black-forest-labs/flux-kontext-pro',
    status,
    input: { prompt: 'a cat' },
    output,
    error: null,
    created_at: '2026-07-26T10:00:00Z',
    started_at: null,
    completed_at: null,
    urls: {
      get: 'https://api.replicate.com/v1/predictions/pred_test123',
      cancel: 'https://api.replicate.com/v1/predictions/pred_test123/cancel',
    },
  };
}

function mockSearchResults() {
  return {
    results: [
      {
        owner: 'black-forest-labs',
        name: 'flux-kontext-pro',
        description: 'Fast image generation',
        run_count: 1000000,
        url: 'https://replicate.com/black-forest-labs/flux-kontext-pro',
      },
      {
        owner: 'stability-ai',
        name: 'sdxl',
        description: 'Stable Diffusion XL',
        run_count: 500000,
        url: 'https://replicate.com/stability-ai/sdxl',
      },
    ],
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
      json: () => Promise.resolve(mockPredictionResponse()),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.replicate',
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
        secrets: { API_TOKEN: 'test-replicate-token' },
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

describe('Replicate Agent App', () => {
  it('lists all 5 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'cancel-prediction',
      'get-prediction',
      'list-models',
      'list-predictions',
      'run',
    ]);
  });

  it('health check reports ready with API token', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('list-models searches by query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSearchResults()),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-models', { query: 'flux' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe('black-forest-labs/flux-kontext-pro');
    expect(data[1].id).toBe('stability-ai/sdxl');
  });

  it('list-models gets model schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockModelResponse()),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-models', { model: 'black-forest-labs/flux-kontext-pro' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('black-forest-labs/flux-kontext-pro');
    expect(data.input_schema).toBeDefined();
    expect(data.latest_version).toBe('abc123');
  });

  it('run starts an async prediction', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPredictionResponse('starting')),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'run', {
      model: 'black-forest-labs/flux-kontext-pro',
      input: { prompt: 'a cat wearing sunglasses' },
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('pred_test123');
    expect(data.status).toBe('starting');

    // Verify the API was called with correct endpoint
    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toContain('/models/black-forest-labs/flux-kontext-pro/predictions');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.input.prompt).toBe('a cat wearing sunglasses');
  });

  it('get-prediction returns prediction status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            mockPredictionResponse('succeeded', ['https://output.replicate.com/image.png']),
          ),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-prediction', { predictionId: 'pred_test123' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.status).toBe('succeeded');
    expect(data.output).toEqual(['https://output.replicate.com/image.png']);
  });

  it('run fails gracefully on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid API token'),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'run', {
      model: 'some/model',
      input: { prompt: 'test' },
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('401');
  });

  it('cancel-prediction sends POST to cancel endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPredictionResponse('canceled')),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'cancel-prediction', { predictionId: 'pred_test123' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.status).toBe('canceled');

    // Verify correct endpoint and method
    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toContain('/predictions/pred_test123/cancel');
    expect(fetchCall[1].method).toBe('POST');
  });

  it('list-predictions returns recent predictions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 'pred_1',
                model: 'some/model',
                status: 'succeeded',
                created_at: '2026-07-26T10:00:00Z',
                completed_at: '2026-07-26T10:01:00Z',
                error: null,
                output: ['https://output.replicate.com/1.png'],
              },
              {
                id: 'pred_2',
                model: 'other/model',
                status: 'processing',
                created_at: '2026-07-26T10:02:00Z',
                completed_at: null,
                error: null,
                output: null,
              },
            ],
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-predictions', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe('pred_1');
    expect(data[0].status).toBe('succeeded');
    expect(data[1].id).toBe('pred_2');
    expect(data[1].status).toBe('processing');
  });
});
