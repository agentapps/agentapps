/**
 * Integration tests for the SendGrid Agent App.
 *
 * Uses InProcessRuntime + AppStation to spin up the app in-process. Mocks
 * global `fetch` so tests run without real SendGrid credentials.
 *
 * Covers: tool listing (16 tools), health check ready, send-email succeeds,
 * list-contacts returns data, get-stats returns stats, search-contacts returns data,
 * API error returns failure.
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
    installationId: 'inst_sendgrid',
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
    context: { userId: 'u_test', installationId: 'inst_sendgrid' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a real Response like fetch returns. */
function res(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  const hasBody = body !== undefined && status !== 204 && status !== 202;
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
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.sendgrid',
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
        secrets: { API_KEY: 'SG.test-sendgrid-key' },
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

describe('SendGrid Agent App — tool listing', () => {
  it('lists all 16 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools).toHaveLength(16);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'add-contact',
      'create-contact-list',
      'delete-contact-list',
      'delete-contacts',
      'get-contact',
      'get-contact-list',
      'get-stats',
      'get-template',
      'list-contact-lists',
      'list-contacts',
      'list-sender-identities',
      'list-suppressions',
      'list-templates',
      'search-contacts',
      'send-email',
      'validate-email',
    ]);
  });
});

describe('SendGrid Agent App — health check', () => {
  it('reports ready when API key is valid', async () => {
    stubFetch(res(200, { first_name: 'Test', last_name: 'User', username: 'testuser' }));

    const sessionId = await initAndOpen();

    received.length = 0;
    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });
});

describe('SendGrid Agent App — send-email', () => {
  it('sends email successfully', async () => {
    stubFetch(res(202));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'send-email', {
      to: 'recipient@example.com',
      from: 'sender@example.com',
      subject: 'Hello from SendGrid',
      textContent: 'This is a test email.',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    expect(data.to).toBe('recipient@example.com');
    expect(data.from).toBe('sender@example.com');
    expect(data.subject).toBe('Hello from SendGrid');
  });
});

describe('SendGrid Agent App — list-contacts', () => {
  it('returns contacts data', async () => {
    stubFetch(
      res(200, {
        result: [
          { id: 'c1', email: 'alice@example.com', first_name: 'Alice', last_name: 'Smith' },
          { id: 'c2', email: 'bob@example.com', first_name: 'Bob', last_name: 'Jones' },
        ],
        contact_count: 2,
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-contacts', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    const contacts = data.contacts as Array<Record<string, unknown>>;
    expect(contacts).toHaveLength(2);
    expect(contacts[0].email).toBe('alice@example.com');
    expect(data.contactCount).toBe(2);
  });
});

describe('SendGrid Agent App — get-stats', () => {
  it('returns stats data', async () => {
    stubFetch(
      res(200, [
        {
          date: '2026-07-01',
          stats: [
            {
              metrics: {
                requests: 100,
                delivered: 95,
                opens: 40,
                clicks: 10,
                bounces: 5,
              },
            },
          ],
        },
      ]),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-stats', { startDate: '2026-07-01' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    const stats = data.stats as Array<Record<string, unknown>>;
    expect(stats).toHaveLength(1);
    expect(stats[0].date).toBe('2026-07-01');
  });
});

describe('SendGrid Agent App — search-contacts', () => {
  it('searches contacts with SGQL query', async () => {
    stubFetch(
      res(200, {
        result: [{ id: 'c1', email: 'alice@example.com', first_name: 'Alice', last_name: 'Smith' }],
        contact_count: 1,
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'search-contacts', { query: "email LIKE '%@example.com'" });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    const contacts = data.contacts as Array<Record<string, unknown>>;
    expect(contacts).toHaveLength(1);
    expect(contacts[0].email).toBe('alice@example.com');
    expect(data.contactCount).toBe(1);
  });
});

describe('SendGrid Agent App — API error propagation', () => {
  it('returns failure on API error', async () => {
    stubFetch(
      res(401, {
        errors: [
          { message: 'The provided authorization permission is invalid, expired, or revoked.' },
        ],
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-contacts', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('SENDGRID_ERROR');
    expect(error.message as string).toContain('401');
  });
});
