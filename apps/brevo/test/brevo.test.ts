/**
 * Integration tests for the Brevo Agent App.
 *
 * Uses InProcessRuntime + AppStation to spin up the app in-process. Mocks
 * global `fetch` so tests run without real Brevo credentials.
 *
 * Follows the same pattern as the ElevenLabs reference test (elevenlabs.test.ts).
 *
 * Covers: tool listing, health check, create-contact, list-contacts,
 * send-transactional-email, list-email-campaigns, get-contact, delete-contact,
 * update-contact, add-contact-to-list, list-folders, create-list,
 * get-email-event-report, API error propagation, and client behavior.
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
    installationId: 'inst_brevo',
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
    context: { userId: 'u_test', installationId: 'inst_brevo' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a real Response like fetch returns. */
function res(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  const hasBody = body !== undefined && status !== 204;
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
      json: () => Promise.resolve({}),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.brevo',
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
        secrets: { BREVO_API_KEY: 'test-brevo-key' },
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

describe('Brevo Agent App — tool listing', () => {
  it('lists all 23 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools).toHaveLength(23);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'add-contact-to-list',
      'create-contact',
      'create-email-campaign',
      'create-email-template',
      'create-list',
      'delete-contact',
      'get-aggregated-smtp-report',
      'get-contact',
      'get-email-campaign',
      'get-email-event-report',
      'import-contacts',
      'list-attributes',
      'list-contacts',
      'list-email-campaigns',
      'list-email-templates',
      'list-folders',
      'list-lists',
      'list-segments',
      'remove-contact-from-list',
      'send-email-campaign',
      'send-test-email',
      'send-transactional-email',
      'update-contact',
    ]);
  });
});

describe('Brevo Agent App — health check', () => {
  it('reports ready when API key is valid', async () => {
    stubFetch(res(200, { email: 'team@empresa.com', companyName: 'Test' }));

    const sessionId = await initAndOpen();

    received.length = 0;
    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });
});

describe('Brevo Agent App — create-contact', () => {
  it('201 with an id returns updated:false (new contact created)', async () => {
    stubFetch(res(201, { id: 42 }));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-contact', { email: 'a@b.com', listIds: [3] });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe(42);
    expect(data.email).toBe('a@b.com');
    expect(data.listIds).toEqual([3]);
    expect(data.updated).toBe(false);
  });

  it('204 empty body + updateEnabled returns updated:true', async () => {
    stubFetch(res(204));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-contact', { email: 'a@b.com', updateEnabled: true });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    expect(data.id).toBeNull();
    expect(data.updated).toBe(true);
  });

  it('rejects invalid email at the boundary (validation error)', async () => {
    const _fetchMock = stubFetch(res(200, {}));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-contact', { email: 'nope' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toMatch(/not a valid email/);
  });
});

describe('Brevo Agent App — list-contacts', () => {
  it('returns shaped contacts with pagination', async () => {
    stubFetch(
      res(200, {
        contacts: [
          {
            id: 1,
            email: 'a@b.com',
            listIds: [3],
            emailBlacklisted: false,
            smsBlacklisted: false,
            attributes: { FIRSTNAME: 'Ana' },
            createdAt: '2026-01-01',
            modifiedAt: '2026-01-02',
          },
          {
            id: 2,
            email: 'c@d.com',
            listIds: [5],
            emailBlacklisted: true,
            smsBlacklisted: false,
            attributes: {},
            createdAt: '2026-01-03',
            modifiedAt: '2026-01-04',
          },
        ],
        count: 2,
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-contacts', { limit: 10, offset: 0 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    const contacts = data.contacts as Array<Record<string, unknown>>;
    expect(contacts).toHaveLength(2);
    expect(contacts[0].email).toBe('a@b.com');
    expect(contacts[1].emailBlacklisted).toBe(true);
  });
});

describe('Brevo Agent App — send-transactional-email', () => {
  it('sends email successfully', async () => {
    stubFetch(res(201, { messageId: '<msg-123@brevo>' }));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'send-transactional-email', {
      sender: { email: 'ana@empresa.com', name: 'Ana' },
      to: [{ email: 'cliente@dominio.com' }],
      subject: 'Hello',
      textContent: 'Body text',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
  });

  it('rejects missing subject at the boundary', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'send-transactional-email', {
      sender: { email: 'ana@empresa.com' },
      to: [{ email: 'cliente@dominio.com' }],
      subject: '',
      textContent: 'Body',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toMatch(/subject/);
  });
});

describe('Brevo Agent App — list-email-campaigns', () => {
  it('returns shaped campaigns', async () => {
    stubFetch(
      res(200, {
        campaigns: [
          {
            id: 10,
            name: 'Promo',
            subject: 'Big Sale',
            type: 'classic',
            status: 'sent',
            createdAt: '2026-01-01',
          },
        ],
        count: 1,
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-email-campaigns', { limit: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    const campaigns = data.campaigns as Array<Record<string, unknown>>;
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].name).toBe('Promo');
    expect(campaigns[0].status).toBe('sent');
  });
});

describe('Brevo Agent App — get-contact', () => {
  it('returns a shaped contact', async () => {
    stubFetch(
      res(200, {
        id: 42,
        email: 'test@example.com',
        emailBlacklisted: false,
        smsBlacklisted: false,
        listIds: [1, 2],
        attributes: { FIRSTNAME: 'Test' },
        createdAt: '2026-01-01',
        modifiedAt: '2026-01-02',
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-contact', { identifier: 'test@example.com' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    expect(data.email).toBe('test@example.com');
    expect(data.listIds).toEqual([1, 2]);
  });
});

describe('Brevo Agent App — delete-contact', () => {
  it('deletes a contact successfully', async () => {
    stubFetch(res(204));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'delete-contact', { identifier: 'test@example.com' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
  });
});

describe('Brevo Agent App — update-contact', () => {
  it('updates a contact successfully', async () => {
    stubFetch(res(204));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'update-contact', {
      identifier: 'test@example.com',
      attributes: { FIRSTNAME: 'Updated' },
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
  });

  it('rejects update with no mutable field', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'update-contact', { identifier: 'test@example.com' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toMatch(/at least one field to update/);
  });
});

describe('Brevo Agent App — add-contact-to-list', () => {
  it('adds contacts to a list', async () => {
    stubFetch(res(201, { contacts: { success: ['a@b.com'], failure: [] } }));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-contact-to-list', { listId: 3, emails: ['a@b.com'] });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    expect(data.success).toEqual(['a@b.com']);
    expect(data.failure).toEqual([]);
  });
});

describe('Brevo Agent App — list-folders', () => {
  it('returns shaped folders', async () => {
    stubFetch(
      res(200, {
        folders: [
          {
            id: 1,
            name: 'Main',
            totalSubscribers: 100,
            uniqueSubscribers: 95,
            totalBlacklisted: 5,
            internalToken: 'secret',
          },
        ],
        count: 1,
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-folders', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    const folders = data.folders as Array<Record<string, unknown>>;
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('Main');
    expect(folders[0]).not.toHaveProperty('internalToken');
  });
});

describe('Brevo Agent App — create-list', () => {
  it('creates a list and returns the id', async () => {
    stubFetch(res(201, { id: 42 }));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-list', { name: 'VIP', folderId: 1 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
  });

  it('rejects missing folderId at the boundary', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-list', { name: 'VIP' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toMatch(/folderId/);
  });
});

describe('Brevo Agent App — get-email-event-report', () => {
  it('returns shaped email events', async () => {
    stubFetch(
      res(200, {
        events: [
          {
            date: '2026-01-15T10:00:00Z',
            email: 'a@b.com',
            event: 'delivered',
            messageId: '<m1>',
            subject: 'Test',
            tag: 'promo',
            reason: null,
            link: null,
            from: 'sender@empresa.com',
            templateId: 5,
            ip: '1.2.3.4',
          },
        ],
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-email-event-report', { days: 7 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as Record<string, unknown>;
    const events = data.events as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    expect(events[0].email).toBe('a@b.com');
    expect(events[0].event).toBe('delivered');
    expect(events[0]).not.toHaveProperty('ip');
  });
});

describe('Brevo Agent App — API error propagation', () => {
  it('propagates a 401 as an error result with AUTH_INVALID', async () => {
    stubFetch(res(401, { code: 'unauthorized', message: 'Key not found' }));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-contacts', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toMatch(/AUTH_INVALID/);
  });

  it('propagates a 404 as an error result with NOT_FOUND', async () => {
    stubFetch(res(404, { message: 'Contact does not exist' }));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-contact', { identifier: 'gone@example.com' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toMatch(/NOT_FOUND/);
  });
});

describe('Brevo Agent App — client request behavior', () => {
  it('authenticates with the api-key header, never a Bearer token', async () => {
    const fetchMock = stubFetch(res(200, { contacts: [], count: 0 }));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-contacts', {});

    await waitForType('tool_result');

    expect(fetchMock).toHaveBeenCalled();
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const [url, init] = lastCall as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['api-key']).toBe('test-brevo-key');
    expect(headers).not.toHaveProperty('authorization');
    expect(headers).not.toHaveProperty('Authorization');
    expect(JSON.stringify(init.headers)).not.toMatch(/bearer/i);
    expect(url).toBe('https://api.brevo.com/v3/contacts?limit=50&offset=0');
  });

  it('POST carries the JSON content-type and a stringified body', async () => {
    const fetchMock = stubFetch(res(201, { id: 1 }));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-contact', { email: 'a@b.com' });

    await waitForType('tool_result');

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const [, init] = lastCall as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.com' }));
  });

  it('serializes query params for campaigns filter', async () => {
    const fetchMock = stubFetch(res(200, { campaigns: [], count: 0 }));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-email-campaigns', { status: 'sent', limit: 50 });

    await waitForType('tool_result');

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const [url] = lastCall as unknown as [string];
    expect(url).toContain('status=sent');
    expect(url).toContain('limit=50');
  });
});
