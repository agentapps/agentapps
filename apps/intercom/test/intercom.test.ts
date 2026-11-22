/**
 * Tests for the Intercom Agent App.
 *
 * Mocks the Intercom API so tests run without real credentials.
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
    installationId: 'inst_intercom',
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
    context: { userId: 'u_test', installationId: 'inst_intercom' },
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
    appId: 'app.intercom',
    appVersion: '2.0.2',
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
        secrets: { ACCESS_TOKEN: 'test-intercom-token' },
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

describe('Intercom Agent App', () => {
  it('lists all 12 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'assign-conversation',
      'get-contact',
      'get-conversation',
      'get-workspace',
      'list-admins',
      'list-tags',
      'list-teams',
      'reply-conversation',
      'search-contacts',
      'search-conversations',
      'tag-conversation',
      'update-conversation',
    ]);
  });

  it('health check completes with valid access token', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The Intercom health handler returns { status: 'ready' } when a valid
    // access token is present. The SDK correctly reports 'ready'.
    expect(health.status).toBe('ready');
    expect(health.version).toBe('2.0.2');
  });

  it('get-workspace returns admin and workspace info', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              id: 'admin_123',
              name: 'Jane Smith',
              email: 'jane@example.com',
              app: {
                id_code: 'ws_abc',
                name: 'My Workspace',
                timezone: 'America/New_York',
                region: 'US',
                created_at: 1700000000,
              },
            }),
          ),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-workspace', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const admin = data.admin as Record<string, unknown>;
    const workspace = data.workspace as Record<string, unknown>;
    expect(admin.id).toBe('admin_123');
    expect(admin.name).toBe('Jane Smith');
    expect(workspace.name).toBe('My Workspace');
    expect(workspace.region).toBe('US');
  });

  it('list-admins returns all admins in workspace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              admins: [
                {
                  id: 'a1',
                  name: 'Alice',
                  email: 'alice@co.com',
                  has_inbox_seat: true,
                  type: 'admin',
                },
                {
                  id: 'a2',
                  name: 'Bob',
                  email: 'bob@co.com',
                  has_inbox_seat: false,
                  type: 'admin',
                },
              ],
            }),
          ),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-admins', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.count).toBe(2);
    const admins = data.admins as Array<Record<string, unknown>>;
    expect(admins[0].name).toBe('Alice');
    expect(admins[0].hasInboxSeat).toBe(true);
    expect(admins[1].name).toBe('Bob');
  });

  it('search-conversations returns filtered conversations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              conversations: [
                {
                  id: 'conv_1',
                  state: 'open',
                  priority: 'priority',
                  created_at: 1700000000,
                  updated_at: 1700001000,
                  source: { type: 'email', subject: 'Help needed' },
                  assignee: { name: 'Alice' },
                  team_assignee: { name: 'Support' },
                  tags: { tags: [{ name: 'urgent' }] },
                },
              ],
              pages: { total_pages: 1, next: null },
            }),
          ),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-conversations', { state: 'open' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.count).toBe(1);
    const conversations = data.conversations as Array<Record<string, unknown>>;
    expect(conversations[0].id).toBe('conv_1');
    expect(conversations[0].state).toBe('open');
    expect(conversations[0].subject).toBe('Help needed');
    expect(conversations[0].assignee).toBe('Alice');
    expect(conversations[0].tags).toEqual(['urgent']);
  });

  it('health check reports ready even when ACCESS_TOKEN is missing', async () => {
    // Override to return no secrets. The health handler still returns
    // { status: 'ready' } because credential validation is deferred to tool calls.
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
          secrets: {},
        } as MessageBase);
      }
    });

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('get-workspace fails on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              type: 'error.list',
              errors: [{ code: 'unauthorized', message: 'Invalid token' }],
            }),
          ),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-workspace', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('AUTH_INVALID');
  });
});
