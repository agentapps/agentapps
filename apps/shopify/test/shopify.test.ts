/**
 * Tests for the Shopify Agent App.
 *
 * Mocks the Shopify API so tests run without real credentials.
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
    installationId: 'inst_shopify',
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
    context: { userId: 'u_test', installationId: 'inst_shopify' },
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
    appId: 'app.shopify',
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
        secrets: { SHOP_DOMAIN: 'test-store.myshopify.com', ACCESS_TOKEN: 'shpat_fake123' },
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

describe('Shopify Agent App', () => {
  it('lists all 19 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_discount',
      'create_fulfillment',
      'create_product',
      'create_webhook',
      'delete_product',
      'get_customer',
      'get_order',
      'get_product',
      'get_shop',
      'list_collections',
      'list_customers',
      'list_inventory_items',
      'list_orders',
      'list_pages',
      'list_products',
      'list_webhooks',
      'update_inventory_level',
      'update_order',
      'update_product',
    ]);
  });

  it('health check reports ready with credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            shop: { name: 'Test Store' },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
    expect(health.message).toContain('Test Store');
  });

  it('list_products returns product list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            products: [
              { id: 123, title: 'Widget', vendor: 'Acme' },
              { id: 456, title: 'Gadget', vendor: 'Acme' },
            ],
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list_products', { limit: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.products as Array<Record<string, unknown>>).toHaveLength(2);
  });

  it('get_order returns order data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            order: {
              id: 789,
              order_number: 1001,
              total_price: '99.95',
              financial_status: 'paid',
            },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get_order', { orderId: '789' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const order = data.order as Record<string, unknown>;
    expect(order.id).toBe(789);
    expect(order.total_price).toBe('99.95');
  });

  it('create_product sends correct JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          product: {
            id: 999,
            title: 'New Widget',
            vendor: 'TestCo',
            product_type: 'Hardware',
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create_product', {
      title: 'New Widget',
      vendor: 'TestCo',
      product_type: 'Hardware',
      tags: 'sale,new',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const product = data.product as Record<string, unknown>;
    expect(product.id).toBe(999);
    expect(product.title).toBe('New Widget');

    // Verify the POST call used JSON with correct body structure
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/products.json');
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body.product.title).toBe('New Widget');
    expect(body.product.vendor).toBe('TestCo');
    expect(body.product.tags).toBe('sale,new');
  });

  it('API error returns failure with Shopify error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () =>
          Promise.resolve({
            errors: '[API] Invalid API key or access token',
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get_shop', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('SHOPIFY_ERROR');
    expect(error.message as string).toContain('401');
  });

  it('create_webhook sends correct JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          webhook: {
            id: 456,
            topic: 'orders/create',
            address: 'https://example.com/hooks/orders',
            format: 'json',
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create_webhook', {
      topic: 'orders/create',
      address: 'https://example.com/hooks/orders',
      format: 'json',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const webhook = data.webhook as Record<string, unknown>;
    expect(webhook.id).toBe(456);
    expect(webhook.topic).toBe('orders/create');

    // Verify the POST call used correct body structure
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/webhooks.json');
    const body = JSON.parse(opts.body as string);
    expect(body.webhook.topic).toBe('orders/create');
    expect(body.webhook.address).toBe('https://example.com/hooks/orders');
    expect(body.webhook.format).toBe('json');
  });
});
