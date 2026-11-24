/**
 * Tests for the Dropbox Agent App.
 *
 * Mocks global fetch so tests run without real Dropbox credentials.
 * Uses the InProcessRuntime + AppStation harness pattern.
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
    installationId: 'inst_dropbox',
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
    context: { userId: 'u_test', installationId: 'inst_dropbox' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Default fetch mock — returns empty success
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.dropbox',
    appVersion: '2.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  // Auto-respond to secret requests
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
        secrets: {
          ACCESS_TOKEN: 'test-dropbox-access-token',
          REFRESH_TOKEN: 'test-dropbox-refresh-token',
        },
      } as MessageBase);
    }
    if (type === 'get_system_secrets') {
      host.send({
        ...createEnvelope('system_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: {
          CLIENT_ID: 'test-client-id',
          CLIENT_SECRET: 'test-client-secret',
        },
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

describe('Dropbox Agent App', () => {
  it('lists all 16 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'copy-file',
      'create-folder',
      'create-shared-link',
      'delete-file',
      'get-account',
      'get-metadata',
      'get-space-usage',
      'get-temporary-link',
      'list-file-requests',
      'list-folder',
      'list-folder-continue',
      'list-shared-links',
      'move-file',
      'revoke-shared-link',
      'save-url',
      'search-files',
    ]);
  });

  it('health check reports ready with valid secrets', async () => {
    // Mock the users/get_current_account call for the health check
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            account_id: 'dbid:AAH4f99T0taONIb-OurWxbNQ6ywGRopQngc',
            name: { display_name: 'Test User' },
            email: 'test@example.com',
          }),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('list-folder returns entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            entries: [
              { '.tag': 'folder', name: 'Photos', path_lower: '/photos', id: 'id:folder1' },
              {
                '.tag': 'file',
                name: 'readme.txt',
                path_lower: '/readme.txt',
                id: 'id:file1',
                size: 1024,
              },
            ],
            cursor: 'cursor123',
            has_more: false,
          }),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-folder', { path: '' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const entries = data.entries as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe('Photos');
    expect(entries[1].name).toBe('readme.txt');
  });

  it('search-files returns matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            matches: [
              {
                match_type: { '.tag': 'filename' },
                metadata: {
                  '.tag': 'metadata',
                  metadata: {
                    '.tag': 'file',
                    name: 'budget.xlsx',
                    path_lower: '/finances/budget.xlsx',
                    id: 'id:file2',
                  },
                },
              },
            ],
            has_more: false,
          }),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'search-files', { query: 'budget' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const matches = data.matches as Array<Record<string, unknown>>;
    expect(matches).toHaveLength(1);
  });

  it('create-folder succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {
              name: 'New Folder',
              path_lower: '/new folder',
              id: 'id:folder2',
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-folder', { path: '/New Folder' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const metadata = data.metadata as Record<string, unknown>;
    expect(metadata.name).toBe('New Folder');
  });

  it('API error returns failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () =>
          Promise.resolve({
            error_summary: 'invalid_access_token/...',
            error: { '.tag': 'invalid_access_token' },
          }),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-folder', { path: '' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('DROPBOX_ERROR');
  });

  it('get-space-usage returns quota info', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            used: 314159265,
            allocation: {
              '.tag': 'individual',
              allocated: 2147483648,
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-space-usage', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.used).toBe(314159265);
    const allocation = data.allocation as Record<string, unknown>;
    expect(allocation.allocated).toBe(2147483648);
  });
});
