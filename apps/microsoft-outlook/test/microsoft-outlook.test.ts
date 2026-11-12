/**
 * Tests for the Microsoft Outlook Agent App.
 *
 * Mocks the Microsoft Graph API so tests run without real credentials.
 *
 * Coverage:
 *   1. Tool listing — verify all 20 tools registered
 *   2. Health check — ready with valid tokens
 *   3. Sample tool calls: list-messages, send-message, search-messages
 *   4. Error handling — missing credentials, API errors
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
let systemSecrets: Record<string, string>;
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
    installationId: 'inst_outlook',
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
    context: { userId: 'u_test', installationId: 'inst_outlook' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  systemSecrets = { CLIENT_ID: 'test-client-id', CLIENT_SECRET: 'test-client-secret' };
  installationSecrets = {
    ACCESS_TOKEN: 'test-access-token',
    REFRESH_TOKEN: 'test-refresh-token',
    EMAIL: 'user@outlook.com',
    EXPIRY_DATE: new Date(Date.now() + 3600_000).toISOString(),
  };

  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(JSON.stringify({})),
      headers: new Headers({ 'content-type': 'application/json' }),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.microsoft.outlook',
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
        secrets: systemSecrets,
      } as MessageBase);
    }

    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: installationSecrets,
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

describe('Microsoft Outlook Agent App', () => {
  it('lists all 20 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'create-draft',
      'create-folder',
      'delete-draft',
      'delete-folder',
      'delete-message',
      'forward-message',
      'get-attachment',
      'get-message',
      'list-drafts',
      'list-folders',
      'list-messages',
      'list-rules',
      'modify-message',
      'move-message',
      'reply-message',
      'search-messages',
      'send-draft',
      'send-message',
      'store-attachment',
      'update-draft',
    ]);
  });

  it('health check completes without error when tokens are valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ mail: 'user@outlook.com' }),
        text: () => Promise.resolve(JSON.stringify({ mail: 'user@outlook.com' })),
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The health handler returns { status: 'ready' } after successfully calling
    // graphRequest('GET', '/me'), confirming credentials are valid.
    expect(health.status).toBe('ready');
  });

  it('list-messages returns formatted messages from inbox', async () => {
    const graphMessages = {
      value: [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          subject: 'Hello World',
          from: { emailAddress: { name: 'Alice', address: 'alice@example.com' } },
          toRecipients: [{ emailAddress: { name: 'Bob', address: 'bob@example.com' } }],
          ccRecipients: [],
          receivedDateTime: '2026-07-30T10:00:00Z',
          bodyPreview: 'Hi Bob, how are you?',
          isRead: false,
          isDraft: false,
          importance: 'normal',
          hasAttachments: false,
          categories: [],
          parentFolderId: 'inbox-id',
        },
        {
          id: 'msg-2',
          conversationId: 'conv-2',
          subject: 'Meeting Tomorrow',
          from: { emailAddress: { name: 'Carol', address: 'carol@example.com' } },
          toRecipients: [{ emailAddress: { name: 'Bob', address: 'bob@example.com' } }],
          ccRecipients: [],
          receivedDateTime: '2026-07-29T14:00:00Z',
          bodyPreview: 'Reminder: meeting at 2pm',
          isRead: true,
          isDraft: false,
          importance: 'high',
          hasAttachments: true,
          categories: ['work'],
          parentFolderId: 'inbox-id',
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(graphMessages),
        text: () => Promise.resolve(JSON.stringify(graphMessages)),
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-messages', { maxResults: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.account).toBe('user@outlook.com');
    expect(data.count).toBe(2);

    const messages = data.messages as Array<Record<string, unknown>>;
    expect(messages[0].subject).toBe('Hello World');
    expect(messages[0].isRead).toBe(false);
    expect(messages[1].subject).toBe('Meeting Tomorrow');
    expect(messages[1].importance).toBe('high');
  });

  it('send-message calls Graph API with correct payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve(null),
      text: () => Promise.resolve(''),
      headers: new Headers({ 'content-type': 'application/json' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'send-message', {
      to: 'alice@example.com',
      subject: 'Test Subject',
      body: 'Hello, this is a test.',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.account).toBe('user@outlook.com');

    // Verify Graph API was called with sendMail endpoint
    const sendMailCall = fetchMock.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('/sendMail'),
    );
    expect(sendMailCall).toBeDefined();

    const body = JSON.parse(sendMailCall![1].body);
    expect(body.message.subject).toBe('Test Subject');
    expect(body.message.toRecipients[0].emailAddress.address).toBe('alice@example.com');
    expect(body.saveToSentItems).toBe(true);
  });

  it('search-messages returns matching results', async () => {
    const searchResults = {
      value: [
        {
          id: 'msg-search-1',
          conversationId: 'conv-s1',
          subject: 'Invoice #1234',
          from: { emailAddress: { name: 'Finance', address: 'finance@company.com' } },
          toRecipients: [{ emailAddress: { address: 'user@outlook.com' } }],
          ccRecipients: [],
          receivedDateTime: '2026-07-28T09:00:00Z',
          bodyPreview: 'Please find attached invoice #1234',
          isRead: true,
          isDraft: false,
          importance: 'normal',
          hasAttachments: true,
          categories: [],
          parentFolderId: 'inbox-id',
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(searchResults),
        text: () => Promise.resolve(JSON.stringify(searchResults)),
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-messages', { query: 'invoice' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.query).toBe('invoice');
    expect(data.count).toBe(1);

    const messages = data.messages as Array<Record<string, unknown>>;
    expect(messages[0].subject).toBe('Invoice #1234');
    expect(messages[0].hasAttachments).toBe(true);
  });

  it('health check fails when credentials are missing', async () => {
    systemSecrets = {};
    installationSecrets = {};

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
  });

  it('tool call fails on Graph API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { code: 'InvalidAuthenticationToken', message: 'Access token is expired.' },
          }),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: { code: 'InvalidAuthenticationToken', message: 'Access token is expired.' },
            }),
          ),
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-messages', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('Access token is expired');
  });
});
