/**
 * Tests for the Cloudflare Agent App.
 *
 * Mocks the Cloudflare API so tests run without real credentials.
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
    installationId: 'inst_cloudflare',
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
    context: { userId: 'u_test', installationId: 'inst_cloudflare' },
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
      json: () => Promise.resolve({ success: true, result: {}, errors: [] }),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.cloudflare',
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
        secrets: { API_TOKEN: 'cf_test_fake123' },
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

describe('Cloudflare Agent App', () => {
  it('lists all 13 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_dns_record',
      'delete_dns_record',
      'get_worker',
      'get_zone',
      'get_zone_analytics',
      'list_dns_records',
      'list_firewall_rules',
      'list_kv_namespaces',
      'list_page_rules',
      'list_workers',
      'list_zones',
      'purge_cache',
      'update_dns_record',
    ]);
  });

  it('health check reports ready with API token', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('list_zones returns zone data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            result: [
              { id: 'zone_abc', name: 'example.com', status: 'active' },
              { id: 'zone_def', name: 'test.dev', status: 'active' },
            ],
            errors: [],
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list_zones', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('example.com');
    expect(data[1].name).toBe('test.dev');
  });

  it('create_dns_record sends correct JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          result: {
            id: 'rec_new123',
            type: 'A',
            name: 'sub.example.com',
            content: '192.0.2.1',
            ttl: 1,
            proxied: true,
          },
          errors: [],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create_dns_record', {
      zoneId: 'zone_abc',
      type: 'A',
      name: 'sub.example.com',
      content: '192.0.2.1',
      ttl: 1,
      proxied: true,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('rec_new123');
    expect(data.type).toBe('A');
    expect(data.name).toBe('sub.example.com');

    // Verify the POST call used JSON
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST' && (call[0] as string).includes('/dns_records');
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/zones/zone_abc/dns_records');
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body.type).toBe('A');
    expect(body.name).toBe('sub.example.com');
    expect(body.content).toBe('192.0.2.1');
    expect(body.proxied).toBe(true);
  });

  it('purge_cache sends purge_everything flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          result: { id: 'purge_123' },
          errors: [],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'purge_cache', {
      zoneId: 'zone_abc',
      purgeEverything: true,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    // Verify the POST call
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST' && (call[0] as string).includes('/purge_cache');
    });
    expect(postCall).toBeDefined();
    const [url, opts] = postCall as [string, Record<string, unknown>];
    expect(url).toContain('/zones/zone_abc/purge_cache');
    const body = JSON.parse(opts.body as string);
    expect(body.purge_everything).toBe(true);
  });

  it('get_zone_analytics passes since/until query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          result: {
            totals: { requests: { all: 10000 }, bandwidth: { all: 5000000 } },
            timeseries: [],
          },
          errors: [],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get_zone_analytics', {
      zoneId: 'zone_abc',
      since: '2024-01-01T00:00:00Z',
      until: '2024-01-02T00:00:00Z',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const totals = data.totals as Record<string, unknown>;
    const requests = totals.requests as Record<string, unknown>;
    expect(requests.all).toBe(10000);

    // Verify the GET call included query parameters
    const getCall = fetchMock.mock.calls.find((call: unknown[]) => {
      return (call[0] as string).includes('/analytics/dashboard');
    });
    expect(getCall).toBeDefined();
    const [url] = getCall as [string];
    expect(url).toContain('/zones/zone_abc/analytics/dashboard');
    expect(url).toContain('since=2024-01-01T00');
    expect(url).toContain('until=2024-01-02T00');
  });

  it('API error returns failure with Cloudflare error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () =>
          Promise.resolve({
            success: false,
            result: null,
            errors: [
              {
                code: 9109,
                message: 'Invalid access token',
              },
            ],
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list_zones', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('CLOUDFLARE_ERROR');
    expect(error.message as string).toContain('403');
  });
});
