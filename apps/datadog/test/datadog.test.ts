/**
 * Tests for the Datadog Agent App.
 *
 * Mocks the Datadog API so tests run without real credentials.
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
    installationId: 'inst_datadog',
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
    context: { userId: 'u_test', installationId: 'inst_datadog' },
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
    appId: 'app.datadog',
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
        secrets: { API_KEY: 'dd_fake_api_key_123', APP_KEY: 'dd_fake_app_key_456' },
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

describe('Datadog Agent App', () => {
  it('lists all 11 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_monitor',
      'get_dashboard',
      'get_incident',
      'get_monitor',
      'list_dashboards',
      'list_downtimes',
      'list_incidents',
      'list_monitors',
      'mute_monitor',
      'query_metrics',
      'search_logs',
    ]);
  });

  it('health check reports ready with API credentials', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('query_metrics returns metric data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'ok',
            series: [
              {
                metric: 'system.cpu.user',
                pointlist: [[1609459200, 42.5]],
              },
            ],
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'query_metrics', {
      query: 'avg:system.cpu.user{*}',
      from: 1609459200,
      to: 1609462800,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.status).toBe('ok');
    expect(data.series).toEqual([
      {
        metric: 'system.cpu.user',
        pointlist: [[1609459200, 42.5]],
      },
    ]);
  });

  it('list_monitors returns monitor list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 12345, name: 'CPU Monitor', type: 'metric alert' },
            { id: 67890, name: 'Memory Monitor', type: 'metric alert' },
          ]),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list_monitors', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('CPU Monitor');
    expect(data[1].name).toBe('Memory Monitor');
  });

  it('search_logs returns log events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 'log_abc',
                attributes: { message: 'Error in service', status: 'error' },
              },
            ],
            meta: { page: { after: 'cursor_123' } },
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search_logs', {
      query: 'service:web status:error',
      from: 'now-1h',
      to: 'now',
      limit: 5,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.data as Array<unknown>).toHaveLength(1);
    expect(data.meta).toBeDefined();
  });

  it('API error returns failure with Datadog error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () =>
          Promise.resolve({
            errors: ['Forbidden'],
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list_monitors', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('DATADOG_ERROR');
    expect(error.message as string).toContain('403');
  });
});
