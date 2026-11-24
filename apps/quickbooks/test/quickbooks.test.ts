/**
 * Tests for the QuickBooks Agent App.
 *
 * Mocks the QuickBooks API so tests run without real credentials.
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
    installationId: 'inst_quickbooks',
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
    context: { userId: 'u_test', installationId: 'inst_quickbooks' },
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
    appId: 'app.quickbooks',
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
        secrets: {
          CLIENT_ID: 'test_client_id',
          CLIENT_SECRET: 'test_client_secret',
        },
      } as MessageBase);
    }

    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: {
          ACCESS_TOKEN: 'test_access_token_fake123',
          REFRESH_TOKEN: 'test_refresh_token_fake456',
          REALM_ID: '1234567890',
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

describe('QuickBooks Agent App', () => {
  it('lists all 18 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'create-customer',
      'create-estimate',
      'create-invoice',
      'create-vendor',
      'get-account',
      'get-balance-sheet',
      'get-company-info',
      'get-customer',
      'get-invoice',
      'get-payment',
      'get-profit-and-loss',
      'list-accounts',
      'list-bills',
      'list-customers',
      'list-invoices',
      'list-items',
      'list-vendors',
      'update-customer',
    ]);
  });

  it('health check reports ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            CompanyInfo: {
              CompanyName: 'Test Company',
              Country: 'US',
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('list-customers returns data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            QueryResponse: {
              Customer: [
                {
                  Id: '1',
                  DisplayName: 'Alice',
                  PrimaryEmailAddr: { Address: 'alice@example.com' },
                },
                { Id: '2', DisplayName: 'Bob', PrimaryEmailAddr: { Address: 'bob@example.com' } },
              ],
              startPosition: 1,
              maxResults: 2,
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-customers', { maxResults: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const queryResponse = data.QueryResponse as Record<string, unknown>;
    expect(queryResponse.Customer as Array<Record<string, unknown>>).toHaveLength(2);
  });

  it('get-invoice returns invoice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            Invoice: {
              Id: '101',
              DocNumber: 'INV-001',
              TotalAmt: 500.0,
              Balance: 500.0,
              CustomerRef: { value: '1', name: 'Alice' },
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-invoice', { invoiceId: '101' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const invoice = data.Invoice as Record<string, unknown>;
    expect(invoice.Id).toBe('101');
    expect(invoice.DocNumber).toBe('INV-001');
    expect(invoice.TotalAmt).toBe(500.0);
  });

  it('create-customer sends correct data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          Customer: {
            Id: '99',
            DisplayName: 'Jane Doe',
            PrimaryEmailAddr: { Address: 'jane@example.com' },
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-customer', {
      displayName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-1234',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const customer = data.Customer as Record<string, unknown>;
    expect(customer.Id).toBe('99');
    expect(customer.DisplayName).toBe('Jane Doe');

    // Verify the POST call used JSON with correct body
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/customer');
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body.DisplayName).toBe('Jane Doe');
    expect(body.PrimaryEmailAddr).toEqual({ Address: 'jane@example.com' });
    expect(body.PrimaryPhone).toEqual({ FreeFormNumber: '555-1234' });
  });

  it('create-vendor sends correct data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          Vendor: {
            Id: '42',
            DisplayName: 'Acme Supplies',
            PrimaryEmailAddr: { Address: 'vendor@acme.com' },
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-vendor', {
      displayName: 'Acme Supplies',
      email: 'vendor@acme.com',
      phone: '555-9876',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const vendor = data.Vendor as Record<string, unknown>;
    expect(vendor.Id).toBe('42');
    expect(vendor.DisplayName).toBe('Acme Supplies');

    // Verify the POST call used JSON with correct body
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/vendor');
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body.DisplayName).toBe('Acme Supplies');
    expect(body.PrimaryEmailAddr).toEqual({ Address: 'vendor@acme.com' });
    expect(body.PrimaryPhone).toEqual({ FreeFormNumber: '555-9876' });
  });

  it('API error returns failure with error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () =>
          Promise.resolve({
            Fault: {
              Error: [
                {
                  Message: 'message=AuthenticationFailed; errorCode=003200; statusCode=401',
                  Detail: 'Token expired or invalid',
                  code: '3200',
                },
              ],
              type: 'AUTHENTICATION',
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-customers', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('QUICKBOOKS_ERROR');
    expect(error.message as string).toContain('401');
  });
});
