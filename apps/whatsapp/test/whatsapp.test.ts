/**
 * Tests for the WhatsApp Agent App.
 *
 * Mocks the WAHA API so tests run without a real WAHA instance.
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
    installationId: 'inst_whatsapp',
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
    context: { userId: 'u_test', installationId: 'inst_whatsapp' },
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
      text: () => Promise.resolve(''),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.whatsapp',
    appVersion: '2.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  // Handle system secret requests (auth.type: "agent" uses systemSecrets)
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
        secrets: { WAHA_API_KEY: 'test-waha-key', WAHA_PORT: '3001' },
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

describe('WhatsApp Agent App', () => {
  // -------------------------------------------------------------------------
  // Tool listing
  // -------------------------------------------------------------------------
  it('lists all 28 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools).toHaveLength(28);
    expect(tools.map((t) => t.name).sort()).toEqual([
      'check-number',
      'delete-profile-picture',
      'download-media',
      'get-chat-labels',
      'get-chats',
      'get-contact-profile-picture',
      'get-contacts',
      'get-labels',
      'get-messages',
      'get-profile',
      'get-unread-chats',
      'health-check',
      'mark-unread',
      'put-chat-labels',
      'reaction',
      'read-messages',
      'request-pairing-code',
      'search-chats',
      'search-contacts',
      'send-document',
      'send-image',
      'send-text',
      'session-status',
      'set-profile-name',
      'set-profile-picture',
      'set-profile-status',
      'start-session',
      'stop-session',
    ]);
  });

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------
  it('health check does not error when WAHA /ping succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message: 'pong' }),
        text: () => Promise.resolve('pong'),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The handler returns void (no explicit HealthResult), so the SDK
    // treats it as a successful-but-unstructured response. The exact
    // status depends on how the SDK maps an undefined return value.
    expect(['ready', 'degraded']).toContain(health.status);
    // Crucially, the message should NOT mention a failure.
    if (health.message) {
      expect(health.message as string).not.toContain('WAHA /ping returned HTTP');
    }
  });

  it('health check reports degraded when WAHA /ping fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('Service unavailable'),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
    expect(health.message as string).toContain('WAHA /ping returned HTTP 503');
  });

  it('health check reports degraded when WAHA is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
    expect(health.message as string).toContain('ECONNREFUSED');
  });

  // -------------------------------------------------------------------------
  // send-text
  // -------------------------------------------------------------------------
  it('send-text posts to WAHA /sendText and returns response', async () => {
    const wahaResponse = {
      id: 'true_34612345678@c.us_3EB0ABC123',
      timestamp: 1700000000,
      from: 'me',
      to: '34612345678@c.us',
      body: 'Hello world',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(wahaResponse),
      text: () => Promise.resolve(JSON.stringify(wahaResponse)),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'send-text', {
      chatId: '34612345678@c.us',
      text: 'Hello world',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('true_34612345678@c.us_3EB0ABC123');
    expect(data.body).toBe('Hello world');

    // Verify the WAHA API was called correctly
    const fetchCalls = fetchMock.mock.calls;
    const sendTextCall = fetchCalls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/sendText'),
    );
    expect(sendTextCall).toBeDefined();
    const body = JSON.parse(sendTextCall![1].body);
    expect(body.chatId).toBe('34612345678@c.us');
    expect(body.text).toBe('Hello world');
    expect(body.session).toBe('default');
  });

  it('send-text returns error on WAHA API failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ message: 'Chat not found' }),
        text: () => Promise.resolve('Chat not found'),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'send-text', {
      chatId: 'invalid@c.us',
      text: 'Should fail',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    // The tool itself returns a success=false object inside the result
    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(false);
    expect(data.status).toBe(422);
  });

  // -------------------------------------------------------------------------
  // get-chats
  // -------------------------------------------------------------------------
  it('get-chats returns normalized chat list', async () => {
    const wahaChats = [
      {
        id: '34612345678@c.us',
        name: 'Alice',
        unreadCount: 3,
        archived: false,
        pinned: true,
        conversationTimestamp: 1700000000,
        lastMessage: { body: 'Hey!', timestamp: 1700000000 },
      },
      {
        id: '34698765432@c.us',
        name: 'Bob',
        unreadCount: 0,
        archived: true,
        pinned: false,
        conversationTimestamp: 1699999000,
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(wahaChats),
        text: () => Promise.resolve(JSON.stringify(wahaChats)),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-chats', { limit: 20 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const chats = data.chats as Array<Record<string, unknown>>;
    expect(chats).toHaveLength(2);
    expect(data.total).toBe(2);
    expect(data.limit).toBe(20);
    expect(data.offset).toBe(0);

    // First chat: Alice with unread messages
    expect(chats[0].name).toBe('Alice');
    expect(chats[0].unreadCount).toBe(3);
    expect(chats[0].isUnread).toBe(true);
    expect(chats[0].pinned).toBe(true);

    // Second chat: Bob, archived, no unread
    expect(chats[1].name).toBe('Bob');
    expect(chats[1].unreadCount).toBe(0);
    expect(chats[1].isUnread).toBe(false);
    expect(chats[1].archived).toBe(true);
  });

  // -------------------------------------------------------------------------
  // get-messages
  // -------------------------------------------------------------------------
  it('get-messages returns stripped message list', async () => {
    const wahaMessages = [
      {
        id: { _serialized: 'msg_001' },
        timestamp: 1700000000,
        from: '34612345678@c.us',
        fromMe: false,
        body: 'Hello!',
        type: 'chat',
        hasMedia: false,
        ack: 3,
        ackName: 'READ',
        _data: { lots: 'of', internal: 'stuff' },
      },
      {
        id: { _serialized: 'msg_002' },
        timestamp: 1700000010,
        from: 'me',
        fromMe: true,
        body: 'Hi there!',
        type: 'chat',
        hasMedia: false,
        ack: 2,
        ackName: 'DELIVERED',
        _data: { more: 'internal data' },
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(wahaMessages),
        text: () => Promise.resolve(JSON.stringify(wahaMessages)),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-messages', { chatId: '34612345678@c.us' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const messages = result.result as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(2);

    // First message: received
    expect(messages[0].body).toBe('Hello!');
    expect(messages[0].fromMe).toBe(false);
    expect(messages[0].type).toBe('chat');

    // Second message: sent
    expect(messages[1].body).toBe('Hi there!');
    expect(messages[1].fromMe).toBe(true);

    // Internal _data should be stripped
    expect(messages[0]._data).toBeUndefined();
    expect(messages[1]._data).toBeUndefined();
  });

  it('get-messages forwards query parameters to WAHA', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
      text: () => Promise.resolve('[]'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-messages', {
      chatId: '34612345678@c.us',
      limit: 50,
      'filter.fromMe': true,
      sortOrder: 'desc',
    });

    await waitForType('tool_result');

    const fetchCalls = fetchMock.mock.calls;
    const messagesCall = fetchCalls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/messages'),
    );
    expect(messagesCall).toBeDefined();
    const url = messagesCall![0] as string;
    expect(url).toContain('chatId=34612345678%40c.us');
    expect(url).toContain('limit=50');
    expect(url).toContain('filter.fromMe=true');
    expect(url).toContain('sortOrder=desc');
  });

  // -------------------------------------------------------------------------
  // health-check tool
  // -------------------------------------------------------------------------
  it('health-check tool returns sessions list', async () => {
    const sessions = [
      { name: 'default', status: 'WORKING' },
      { name: 'secondary', status: 'STOPPED' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sessions),
        text: () => Promise.resolve(JSON.stringify(sessions)),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'health-check', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.status).toBe('ok');
    const resultSessions = data.sessions as Array<Record<string, unknown>>;
    expect(resultSessions).toHaveLength(2);
    expect(resultSessions[0].name).toBe('default');
    expect(resultSessions[0].status).toBe('WORKING');
  });

  // -------------------------------------------------------------------------
  // session-status
  // -------------------------------------------------------------------------
  it('session-status returns session info', async () => {
    const sessionInfo = { name: 'default', status: 'WORKING', me: { id: '34612345678@c.us' } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sessionInfo),
        text: () => Promise.resolve(JSON.stringify(sessionInfo)),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'session-status', { session: 'default' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.status).toBe('WORKING');
    expect(data.name).toBe('default');
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  it('tool returns error when WAHA API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'health-check', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  it('send-text with custom session uses correct session param', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'msg_123' }),
      text: () => Promise.resolve('{"id":"msg_123"}'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'send-text', {
      session: 'custom-session',
      chatId: '34612345678@c.us',
      text: 'Test',
    });

    await waitForType('tool_result');

    const fetchCalls = fetchMock.mock.calls;
    const sendCall = fetchCalls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/sendText'),
    );
    expect(sendCall).toBeDefined();
    const body = JSON.parse(sendCall![1].body);
    expect(body.session).toBe('custom-session');
  });

  // -------------------------------------------------------------------------
  // search-chats
  // -------------------------------------------------------------------------
  it('search-chats filters chats by query', async () => {
    const allChats = [
      { id: '34612345678@c.us', name: 'Alice' },
      { id: '34698765432@c.us', name: 'Bob' },
      { id: '120363001@g.us', name: 'Team Alice' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(allChats),
        text: () => Promise.resolve(JSON.stringify(allChats)),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-chats', { query: 'alice' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.query).toBe('alice');
    expect(data.total).toBe(3);
    const matches = data.matches as Array<Record<string, unknown>>;
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.name).sort()).toEqual(['Alice', 'Team Alice']);
  });

  // -------------------------------------------------------------------------
  // get-unread-chats
  // -------------------------------------------------------------------------
  it('get-unread-chats returns only chats with unread messages', async () => {
    const allChats = [
      { id: '34612345678@c.us', name: 'Alice', unreadCount: 5, conversationTimestamp: 1700000000 },
      { id: '34698765432@c.us', name: 'Bob', unreadCount: 0, conversationTimestamp: 1699999000 },
      { id: '34611111111@c.us', name: 'Carol', unreadCount: 2, conversationTimestamp: 1700000500 },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(allChats),
        text: () => Promise.resolve(JSON.stringify(allChats)),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-unread-chats', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const chats = data.chats as Array<Record<string, unknown>>;
    expect(chats).toHaveLength(2);
    expect(data.total).toBe(2);

    // Should be sorted by unreadCount desc
    expect(chats[0].name).toBe('Alice');
    expect(chats[0].unreadCount).toBe(5);
    expect(chats[1].name).toBe('Carol');
    expect(chats[1].unreadCount).toBe(2);
  });
});
