/**
 * Integration tests for the Canva Agent App.
 *
 * Uses InProcessRuntime to exercise the app through protocol messages.
 * Mocks fetch so tests run without real Canva credentials.
 *
 * Error classification tests (migrated from mca.canva error.test.ts) are
 * split: pure-function tests live in this file alongside integration tests
 * that verify error handling surfaces through the protocol.
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
import { CanvaApiError, classifyCanvaApiError } from '../src/lib/_canva-error.js';

// ---------------------------------------------------------------------------
// Test harness (follows elevenlabs reference pattern)
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
    installationId: 'inst_canva',
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
    context: { userId: 'u_test', installationId: 'inst_canva' },
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
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.canva',
    appVersion: '2.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  // Auto-respond to secret requests with test credentials
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
        secrets: { CLIENT_ID: 'test-client-id', CLIENT_SECRET: 'test-client-secret' },
      } as MessageBase);
    }
    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: { ACCESS_TOKEN: 'test-access-token', REFRESH_TOKEN: 'test-refresh-token' },
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
// Integration tests — protocol-level
// ---------------------------------------------------------------------------

describe('Canva Agent App', () => {
  it('lists all 31 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.length).toBeGreaterThanOrEqual(31);
    // Spot-check a few representative tools across categories
    const names = tools.map((t) => t.name).sort();
    expect(names).toContain('get-design');
    expect(names).toContain('list-designs');
    expect(names).toContain('create-folder');
    expect(names).toContain('upload-asset');
    expect(names).toContain('export-design');
    expect(names).toContain('get-user');
    expect(names).toContain('create-thread');
    expect(names).toContain('autofill-design');
  });

  it('health check reports ready with valid credentials', async () => {
    // Mock the /users/me probe to return OK
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ user_id: 'u_test' }),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('get-design returns curated design shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            design: {
              id: 'DAF1',
              title: 'Test Design',
              owner: { user_id: 'U1', team_id: 'T1' },
              urls: { edit_url: 'https://edit', view_url: 'https://view' },
              thumbnail: { url: 'https://thumb', width: 400, height: 300 },
              page_count: 2,
              created_at: 1700000000,
              updated_at: 1800000000,
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-design', { designId: 'DAF1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('DAF1');
    expect(data.title).toBe('Test Design');
    expect(data.editUrl).toBe('https://edit');
    expect(data.viewUrl).toBe('https://view');
    expect(data.thumbnailUrl).toBe('https://thumb');
  });

  it('tool call fails on API error and surfaces classified error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Map(),
        text: () => Promise.resolve(JSON.stringify({ message: 'Design not found' })),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-design', { designId: 'nonexistent' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('404');
  });
});

// ---------------------------------------------------------------------------
// Error classification — pure function tests (migrated from error.test.ts)
// ---------------------------------------------------------------------------

describe('classifyCanvaApiError', () => {
  it('401 → AUTH_EXPIRED + user_action reconnect', () => {
    const c = classifyCanvaApiError(401, { message: 'Invalid token' });
    expect(c.code).toBe('AUTH_EXPIRED');
    expect(c.action.type).toBe('user_action');
    expect(c.action.description).toMatch(/Reconnect/i);
    expect(c.message).toBe('Invalid token');
  });

  it('403 → PERMISSION_DENIED with scope hint', () => {
    const c = classifyCanvaApiError(403, { message: 'Missing scope: brandtemplate' });
    expect(c.code).toBe('PERMISSION_DENIED');
    expect(c.action.description).toMatch(/scope/i);
    expect(c.message).toBe('Missing scope: brandtemplate');
  });

  it('404 → NOT_FOUND', () => {
    const c = classifyCanvaApiError(404, { message: 'Design not found' });
    expect(c.code).toBe('NOT_FOUND');
    expect(c.message).toBe('Design not found');
  });

  it('429 → RATE_LIMITED + auto_retry', () => {
    const c = classifyCanvaApiError(429, { message: 'Too many requests' });
    expect(c.code).toBe('RATE_LIMITED');
    expect(c.action.type).toBe('auto_retry');
  });

  it('400/422 → VALIDATION_ERROR', () => {
    expect(classifyCanvaApiError(400, { message: 'Bad' }).code).toBe('VALIDATION_ERROR');
    expect(classifyCanvaApiError(422, { message: 'Bad' }).code).toBe('VALIDATION_ERROR');
  });

  it('5xx → PROVIDER_ERROR + auto_retry', () => {
    const c = classifyCanvaApiError(500, { message: 'Internal error' });
    expect(c.code).toBe('PROVIDER_ERROR');
    expect(c.action.type).toBe('auto_retry');
  });

  it('extracts error_description over message when present', () => {
    const c = classifyCanvaApiError(401, { error_description: 'token expired' });
    expect(c.message).toBe('token expired');
  });

  it('falls back to `error` field for Canva 5xx body shapes', () => {
    const c = classifyCanvaApiError(501, { statusCode: 501, error: 'server error' });
    expect(c.message).toBe('server error');
    expect(c.code).toBe('PROVIDER_ERROR');
  });

  it('falls back to fallbackMessage on empty body', () => {
    const c = classifyCanvaApiError(500, '');
    expect(c.message).toBe('Canva API error');
  });

  it('handles plain-text body', () => {
    const c = classifyCanvaApiError(503, 'Service Unavailable');
    expect(c.message).toBe('Service Unavailable');
    expect(c.code).toBe('PROVIDER_ERROR');
  });

  it('NEVER tunes the upstream message — only description is curated', () => {
    const literalMessage = 'Calendar API not enabled in project 12345';
    const c = classifyCanvaApiError(403, { message: literalMessage });
    expect(c.message).toBe(literalMessage);
    expect(c.action.description).not.toBe(literalMessage);
  });
});

describe('CanvaApiError', () => {
  it('wraps classification with status + message', () => {
    const classified = classifyCanvaApiError(404, { message: 'Not found' });
    const err = new CanvaApiError(404, classified);
    expect(err.name).toBe('CanvaApiError');
    expect(err.status).toBe(404);
    expect(err.message).toContain('404');
    expect(err.message).toContain('Not found');
    expect(err.classified).toBe(classified);
  });

  it('is instanceof Error', () => {
    const err = new CanvaApiError(500, classifyCanvaApiError(500, {}));
    expect(err).toBeInstanceOf(Error);
  });
});
