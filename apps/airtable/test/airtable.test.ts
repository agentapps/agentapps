/**
 * Tests for the Airtable Agent App.
 *
 * Mocks the Airtable API so tests run without real credentials.
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
    installationId: 'inst_airtable',
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
    context: { userId: 'u_test', installationId: 'inst_airtable' },
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
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.airtable',
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
        secrets: { API_TOKEN: 'pat_test_fake123' },
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
// Tests
// ---------------------------------------------------------------------------

describe('Airtable Agent App', () => {
  it('lists all 10 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-comment',
      'create-records',
      'create-webhook',
      'delete-records',
      'get-record',
      'list-bases',
      'list-comments',
      'list-records',
      'list-tables',
      'update-records',
    ]);
  });

  it('health check reports ready with API token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ bases: [] }),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('list-records sends correct URL with baseId and table', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [
            { id: 'rec001', fields: { Name: 'Alice', Status: 'Active' } },
            { id: 'rec002', fields: { Name: 'Bob', Status: 'Inactive' } },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-records', {
      baseId: 'appABC123',
      tableIdOrName: 'Tasks',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const records = data.records as Array<Record<string, unknown>>;
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe('rec001');

    // Verify the GET call hit the correct endpoint
    const getCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const url = call[0] as string;
      return url.includes('/appABC123/Tasks');
    });
    expect(getCall).toBeDefined();
    const [url] = getCall as [string, Record<string, unknown>];
    expect(url).toContain('https://api.airtable.com/v0/appABC123/Tasks');
    expect(url).toContain('maxRecords=100');
  });

  it('create-records sends POST with records body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [{ id: 'recNEW1', fields: { Name: 'Charlie', Status: 'Active' } }],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-records', {
      baseId: 'appABC123',
      tableIdOrName: 'Tasks',
      records: [{ fields: { Name: 'Charlie', Status: 'Active' } }],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const records = data.records as Array<Record<string, unknown>>;
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('recNEW1');

    // Verify the POST call used JSON body
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const [postUrl, opts] = postCall as [string, Record<string, unknown>];
    expect(postUrl).toContain('/appABC123/Tasks');
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body.records).toHaveLength(1);
    expect(body.records[0].fields.Name).toBe('Charlie');
    expect(body.typecast).toBe(true);
  });

  it('delete-records sends DELETE with record IDs in URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [
            { id: 'rec001', deleted: true },
            { id: 'rec002', deleted: true },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'delete-records', {
      baseId: 'appABC123',
      tableIdOrName: 'Tasks',
      recordIds: ['rec001', 'rec002'],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const records = data.records as Array<Record<string, unknown>>;
    expect(records).toHaveLength(2);

    // Verify the DELETE call had record IDs in the URL
    const deleteCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'DELETE';
    });
    expect(deleteCall).toBeDefined();
    const [deleteUrl] = deleteCall as [string, Record<string, unknown>];
    expect(deleteUrl).toContain('/appABC123/Tasks');
    expect(deleteUrl).toContain('records%5B%5D=rec001');
    expect(deleteUrl).toContain('records%5B%5D=rec002');
  });

  it('API error returns failure with Airtable error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () =>
          Promise.resolve({
            error: {
              type: 'AUTHENTICATION_REQUIRED',
              message: 'Invalid API key',
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-bases', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('AIRTABLE_ERROR');
    expect(error.message as string).toContain('401');
  });

  it('add-comment sends POST with comment text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'com001',
          author: { id: 'usr001', name: 'Test User' },
          text: 'Great progress!',
          createdTime: '2024-01-01T00:00:00.000Z',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'add-comment', {
      baseId: 'appABC123',
      tableIdOrName: 'Tasks',
      recordId: 'rec001',
      text: 'Great progress!',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('com001');
    expect(data.text).toBe('Great progress!');

    // Verify the POST call used the correct URL and body
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const url = call[0] as string;
      const opts = call[1] as Record<string, unknown>;
      return url.includes('/comments') && opts.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const [postUrl, opts] = postCall as [string, Record<string, unknown>];
    expect(postUrl).toContain('/appABC123/Tasks/rec001/comments');
    const body = JSON.parse(opts.body as string);
    expect(body.text).toBe('Great progress!');
  });
});
