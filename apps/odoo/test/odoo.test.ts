/**
 * Tests for the Odoo Agent App.
 *
 * Mocks the Odoo JSON-RPC API so tests run without real credentials.
 *
 * Coverage:
 *   1. Tool listing — verify all 25 tools registered
 *   2. Health check — ready with valid API key
 *   3. Sample tool calls: list-partners, search-records, create-record
 *   4. Error handling — missing credentials, Odoo RPC errors
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
    installationId: 'inst_odoo',
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
    context: { userId: 'u_test', installationId: 'inst_odoo' },
  } as MessageBase);
}

/**
 * Helper to create a mock JSON-RPC success response.
 */
function mockJsonRpcSuccess(result: unknown) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: 1, result })),
    json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result }),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

/**
 * Helper to create a mock JSON-RPC error response.
 */
function mockJsonRpcError(code: number, message: string) {
  return {
    ok: true,
    status: 200,
    text: () =>
      Promise.resolve(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code, message, data: { message } },
        }),
      ),
    json: () =>
      Promise.resolve({
        jsonrpc: '2.0',
        id: 1,
        error: { code, message, data: { message } },
      }),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  installationSecrets = {
    BASE_URL: 'https://mycompany.odoo.com',
    DATABASE: 'mycompany',
    API_KEY: 'test-odoo-api-key',
  };

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonRpcSuccess(1)));

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.odoo',
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
        secrets: installationSecrets,
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

describe('Odoo Agent App', () => {
  it('lists all 25 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'call-method',
      'count-records',
      'create-leave',
      'create-partner',
      'create-project-task',
      'create-record',
      'create-sale-order',
      'create-timesheet',
      'delete-record',
      'get-partner',
      'get-record',
      'get-sale-order',
      'list-employees',
      'list-invoices',
      'list-leaves',
      'list-models',
      'list-partners',
      'list-products',
      'list-projects',
      'list-sale-orders',
      'list-tasks',
      'list-timesheets',
      'search-records',
      'update-partner',
      'update-record',
    ]);
  });

  it('health check completes without error when API is reachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonRpcSuccess(2)));

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The health handler returns { status: 'ready' } after successfully
    // calling authenticate(), confirming the API is reachable and credentials work.
    expect(health.status).toBe('ready');
  });

  it('list-partners returns partner records', async () => {
    const partners = [
      {
        id: 1,
        name: 'Acme Corp',
        email: 'info@acme.com',
        phone: '+1234',
        is_company: true,
        parent_id: false,
        user_id: false,
      },
      {
        id: 2,
        name: 'Jane Doe',
        email: 'jane@acme.com',
        phone: '+5678',
        is_company: false,
        parent_id: [1, 'Acme Corp'],
        user_id: false,
      },
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonRpcSuccess(partners)));

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-partners', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('Acme Corp');
    expect(data[0].is_company).toBe(true);
    expect(data[1].name).toBe('Jane Doe');
    expect(data[1].email).toBe('jane@acme.com');
  });

  it('search-records queries the correct model', async () => {
    const records = [
      { id: 10, name: 'Widget A', list_price: 19.99 },
      { id: 11, name: 'Widget B', list_price: 29.99 },
    ];

    const fetchMock = vi.fn().mockResolvedValue(mockJsonRpcSuccess(records));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-records', {
      model: 'product.template',
      fields: ['id', 'name', 'list_price'],
      limit: 10,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('Widget A');
    expect(data[1].list_price).toBe(29.99);

    // Verify JSON-RPC was called with the right model
    const rpcCall = fetchMock.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('/jsonrpc'),
    );
    expect(rpcCall).toBeDefined();

    const body = JSON.parse(rpcCall![1].body);
    expect(body.params.service).toBe('object');
    expect(body.params.method).toBe('execute_kw');
    // args: [database, uid, apikey, model, method, domain_args]
    expect(body.params.args[3]).toBe('product.template');
    expect(body.params.args[4]).toBe('search_read');
  });

  it('create-record creates a new record and returns ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonRpcSuccess(42)));

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-record', {
      model: 'res.partner',
      values: { name: 'New Partner', email: 'new@partner.com', is_company: true },
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    expect(result.result).toBe(42);
  });

  it('health check fails when API_KEY is missing', async () => {
    installationSecrets = { BASE_URL: 'https://mycompany.odoo.com', DATABASE: 'mycompany' };

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
  });

  it('tool call fails on Odoo RPC error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonRpcError(2, 'Access Denied')));

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-partners', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('Access Denied');
  });

  it('tool call fails on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('Bad Gateway'),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-records', { model: 'res.partner' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('non-JSON');
  });
});
