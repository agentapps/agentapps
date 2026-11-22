/**
 * Integration tests for the Runn Agent App — migrated from mca.runn client.test.ts.
 *
 * Uses the InProcessRuntime harness to exercise the full protocol path.
 * Also includes unit tests for buildUrl, resolveRetryDelay, and firstOf
 * that can be tested via direct import.
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
import { buildUrl, resolveRetryDelay } from '../src/lib/runn-client.js';
import { firstOf } from '../src/tools/utils.js';

// ---------------------------------------------------------------------------
// Pure unit tests (direct import, no harness)
// ---------------------------------------------------------------------------

describe('buildUrl', () => {
  it('joins base + endpoint and serialises defined query params only', () => {
    const url = new URL(buildUrl('/projects', { limit: 50, cursor: undefined, isArchived: false }));
    expect(url.origin + url.pathname).toBe('https://api.runn.io/projects');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('isArchived')).toBe('false');
    expect(url.searchParams.has('cursor')).toBe(false);
  });
});

describe('resolveRetryDelay', () => {
  it('honours a numeric Retry-After (seconds -> ms)', () => {
    expect(resolveRetryDelay('2', 0)).toBe(2000);
  });
  it('clamps to 30s', () => {
    expect(resolveRetryDelay('100', 0)).toBe(30_000);
  });
  it('falls back to the schedule when header is absent or non-numeric or negative', () => {
    expect(resolveRetryDelay(null, 0)).toBe(800);
    expect(resolveRetryDelay(null, 1)).toBe(2000);
    expect(resolveRetryDelay('abc', 0)).toBe(800);
    expect(resolveRetryDelay('-5', 0)).toBe(800);
    expect(resolveRetryDelay(null, 99)).toBe(5000); // out-of-range attempt -> default
  });
});

describe('firstOf (Runn POST/PATCH returns an array)', () => {
  it('takes the first element of an array', () => {
    expect(firstOf([{ id: 1 }, { id: 2 }])).toEqual({ id: 1 });
  });
  it('passes a bare object through unchanged', () => {
    expect(firstOf({ id: 9 })).toEqual({ id: 9 });
  });
});

// ---------------------------------------------------------------------------
// Integration tests via InProcessRuntime harness
// ---------------------------------------------------------------------------

let appStation: AppStation;
let host: Transport;
let received: MessageBase[];
let fetchCalls: Array<{ url: string; init: RequestInit }>;
let responseQueue: Response[];

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

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function queue(...responses: Response[]): void {
  responseQueue.push(...responses);
}

async function initAndOpen(_apiKey = 'LIVE_test'): Promise<string> {
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
    installationId: 'inst_runn',
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
    context: { userId: 'u_test', installationId: 'inst_runn' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

/** Controls what installation secrets the host returns. Override per-test before initAndOpen(). */
let runnUserSecrets: Record<string, string>;

beforeEach(() => {
  fetchCalls = [];
  responseQueue = [];
  runnUserSecrets = { API_KEY: 'LIVE_test' };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr =
        typeof url === 'string' ? url : url instanceof URL ? url.href : (url as Request).url;
      fetchCalls.push({ url: urlStr, init: init ?? {} });
      const r = responseQueue.shift();
      if (!r) {
        // Default: return empty success so health checks and list calls don't hang
        return json({});
      }
      return r;
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.runn',
    appVersion: '2.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  // Auto-respond to secret requests (reads `runnUserSecrets` at call time)
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
        secrets: runnUserSecrets,
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
// Integration tests
// ---------------------------------------------------------------------------

describe('Runn Agent App', () => {
  it('lists all 20 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'create-actual',
      'create-assignment',
      'create-client',
      'create-person',
      'create-placeholder',
      'create-project',
      'delete-assignment',
      'get-person',
      'get-project',
      'get-project-totals',
      'list-actuals',
      'list-assignments',
      'list-clients',
      'list-people',
      'list-placeholders',
      'list-projects',
      'list-roles',
      'list-skills',
      'list-teams',
      'update-project',
    ]);
  });

  it('health check calls /me and succeeds', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
    // Verify /me was actually called with correct auth
    const meCall = fetchCalls.find((c) => c.url.includes('/me'));
    expect(meCall).toBeDefined();
    const headers = meCall!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer LIVE_test');
  });

  it('list-projects sends Bearer token + Accept-Version', async () => {
    queue(json({ values: [{ id: 7, name: 'Apollo' }], nextCursor: null }));

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-projects', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    // Verify the fetch call used correct headers
    const projectCall = fetchCalls.find((c) => c.url.includes('/projects'));
    expect(projectCall).toBeDefined();
    const headers = projectCall!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer LIVE_test');
    expect(headers['Accept-Version']).toBe('1.0.0');
  });

  it('list-projects returns paginated values', async () => {
    queue(
      json({
        values: [
          { id: 1, name: 'P1' },
          { id: 2, name: 'P2' },
        ],
        nextCursor: 'abc',
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-projects', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
  });

  it('tool call fails when API key is missing', async () => {
    // Clear the API key so the handler returns empty secrets
    runnUserSecrets = {};

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-projects', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  it('create-project sends POST with body', async () => {
    queue(json([{ id: 9, name: 'New Project' }]));

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-project', {
      name: 'New Project',
      clientId: 1,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const createCall = fetchCalls.find(
      (c) => c.url.includes('/projects') && c.init.method === 'POST',
    );
    expect(createCall).toBeDefined();
    const headers = createCall!.init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });
});
