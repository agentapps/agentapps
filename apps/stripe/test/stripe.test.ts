/**
 * Tests for the Stripe Agent App.
 *
 * Mocks the Stripe API so tests run without real credentials.
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
    installationId: 'inst_stripe',
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
    context: { userId: 'u_test', installationId: 'inst_stripe' },
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
    appId: 'app.stripe',
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
        secrets: { API_KEY: 'sk_test_fake123' },
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

describe('Stripe Agent App', () => {
  it('lists all 20 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'cancel_subscription',
      'create_checkout_session',
      'create_customer',
      'create_payment_link',
      'create_price',
      'create_product',
      'create_refund',
      'get_balance',
      'get_customer',
      'get_invoice',
      'get_payment',
      'get_subscription',
      'list_charges',
      'list_customers',
      'list_invoices',
      'list_payments',
      'list_payouts',
      'list_prices',
      'list_products',
      'list_subscriptions',
    ]);
  });

  it('health check reports ready with API key', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('get_balance returns balance data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            object: 'balance',
            available: [{ amount: 50000, currency: 'usd' }],
            pending: [{ amount: 12000, currency: 'usd' }],
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get_balance', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.object).toBe('balance');
    expect(data.available).toEqual([{ amount: 50000, currency: 'usd' }]);
    expect(data.pending).toEqual([{ amount: 12000, currency: 'usd' }]);
  });

  it('list_customers returns customer list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            object: 'list',
            data: [
              { id: 'cus_abc', name: 'Alice', email: 'alice@example.com' },
              { id: 'cus_def', name: 'Bob', email: 'bob@example.com' },
            ],
            has_more: false,
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list_customers', { limit: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.object).toBe('list');
    expect(data.data as Array<Record<string, unknown>>).toHaveLength(2);
    expect(data.has_more).toBe(false);
  });

  it('create_customer sends correct form-urlencoded params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'cus_new123',
          object: 'customer',
          name: 'Jane Doe',
          email: 'jane@example.com',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create_customer', {
      email: 'jane@example.com',
      name: 'Jane Doe',
      metadata: { source: 'agent' },
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('cus_new123');
    expect(data.name).toBe('Jane Doe');

    // Verify the POST call used form-urlencoded
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/v1/customers');
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = opts.body as string;
    expect(body).toContain('email=jane%40example.com');
    expect(body).toContain('name=Jane+Doe');
    expect(body).toContain('metadata%5Bsource%5D=agent');
  });

  it('create_product sends correct form-urlencoded params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'prod_new456',
          object: 'product',
          name: 'Premium Plan',
          description: 'Access to all features',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create_product', {
      name: 'Premium Plan',
      description: 'Access to all features',
      metadata: { tier: 'premium' },
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('prod_new456');
    expect(data.name).toBe('Premium Plan');

    // Verify the POST call used form-urlencoded
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/v1/products');
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = opts.body as string;
    expect(body).toContain('name=Premium+Plan');
    expect(body).toContain('description=Access+to+all+features');
    expect(body).toContain('metadata%5Btier%5D=premium');
  });

  it('API error returns failure with Stripe error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () =>
          Promise.resolve({
            error: {
              type: 'authentication_error',
              message: 'Invalid API Key provided: sk_test_****1234',
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get_balance', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('STRIPE_ERROR');
    expect(error.message as string).toContain('401');
  });
});
