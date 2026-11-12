/**
 * Tests for the telemetry provider integration.
 *
 * Covers:
 * - NoopTelemetryProvider correctness (no throws, zero allocation)
 * - NOOP_TELEMETRY singleton
 * - Mock TelemetryProvider receives calls on spawn, session open/close,
 *   message routing, and instance teardown
 * - AppStation works normally without telemetry (default noop)
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStation } from '../src/app-station.js';
import { type AppFactory, InProcessRuntime } from '../src/in-process-runtime.js';
import {
  NOOP_TELEMETRY,
  NoopTelemetryProvider,
  type SpanHandle,
  type TelemetryAttributes,
  type TelemetryProvider,
} from '../src/telemetry.js';

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

const echoAppFactory: AppFactory = (transport) => {
  transport.onMessage((msg) => {
    const m = msg as Record<string, unknown>;
    if (msg.type === 'tool_call') {
      transport.send({
        id: msg.id,
        type: 'tool_result',
        timestamp: new Date().toISOString(),
        version: PROTOCOL_VERSION,
        sessionId: m.sessionId,
        success: true,
        result: m.arguments,
        duration: 1,
      } as MessageBase);
    }
  });
};

// ---------------------------------------------------------------------------
// Mock telemetry provider
// ---------------------------------------------------------------------------

interface MetricCall {
  method: 'counter' | 'histogram' | 'gauge';
  name: string;
  value?: number;
  attributes?: TelemetryAttributes;
}

interface SpanRecord {
  name: string;
  attributes?: TelemetryAttributes;
  statusCalls: Array<{ status: 'ok' | 'error'; message?: string }>;
  ended: boolean;
}

function createMockTelemetry() {
  const metrics: MetricCall[] = [];
  const spans: SpanRecord[] = [];

  const mockSpan: SpanHandle = {
    setAttribute: vi.fn(),
    setStatus: vi.fn(function (this: void, status: 'ok' | 'error', message?: string) {
      // Also push to the last span record for structured assertions
      const last = spans[spans.length - 1];
      if (last) last.statusCalls.push({ status, message });
    }),
    end: vi.fn(function (this: void) {
      const last = spans[spans.length - 1];
      if (last) last.ended = true;
    }),
  };

  const provider: TelemetryProvider = {
    counter(name, value, attributes) {
      metrics.push({ method: 'counter', name, value, attributes });
    },
    histogram(name, value, attributes) {
      metrics.push({ method: 'histogram', name, value, attributes });
    },
    gauge(name, value, attributes) {
      metrics.push({ method: 'gauge', name, value, attributes });
    },
    startSpan(name, attributes) {
      const record: SpanRecord = {
        name,
        attributes,
        statusCalls: [],
        ended: false,
      };
      spans.push(record);
      return mockSpan;
    },
  };

  return { provider, metrics, spans, mockSpan };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectMessages(transport: Transport): MessageBase[] {
  const messages: MessageBase[] = [];
  transport.onMessage((msg) => messages.push(msg));
  return messages;
}

async function waitForMessage(
  messages: MessageBase[],
  type: string,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = messages.find((m) => m.type === type);
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`Timeout waiting for message type '${type}'`);
}

/** Initialize handshake and open one session. Returns the sessionId. */
async function initAndOpen(
  hostTransport: Transport,
  received: MessageBase[],
  installationId = 'inst_1',
): Promise<string> {
  hostTransport.send({
    ...createEnvelope('initialize'),
    supportedVersions: ['2.0'],
    host: { name: 'test', version: '1.0.0' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitForMessage(received, 'initialized');

  // Clear so subsequent waitForMessage calls don't find stale results
  const _initMsgs = received.splice(0, received.length);

  hostTransport.send({
    ...createEnvelope('session_open'),
    installationId,
    tenant: { userId: 'u_alice' },
  } as MessageBase);
  const opened = await waitForMessage(received, 'session_opened');
  return opened.sessionId as string;
}

// ---------------------------------------------------------------------------
// NoopTelemetryProvider
// ---------------------------------------------------------------------------

describe('NoopTelemetryProvider', () => {
  it('does not throw on any method call', () => {
    const noop = new NoopTelemetryProvider();
    expect(() => noop.counter('test.counter', 1, { foo: 'bar' })).not.toThrow();
    expect(() => noop.histogram('test.hist', 42.5, { baz: 1 })).not.toThrow();
    expect(() => noop.gauge('test.gauge', 100)).not.toThrow();
  });

  it('returns a span handle with working no-op methods', () => {
    const noop = new NoopTelemetryProvider();
    const span = noop.startSpan('test.span', { key: 'value' });
    expect(span).toBeDefined();
    expect(() => span.setAttribute('attr', 'val')).not.toThrow();
    expect(() => span.setStatus('ok')).not.toThrow();
    expect(() => span.setStatus('error', 'oops')).not.toThrow();
    expect(() => span.end()).not.toThrow();
  });

  it('returns the same span handle object every time (zero allocation)', () => {
    const noop = new NoopTelemetryProvider();
    const span1 = noop.startSpan('a');
    const span2 = noop.startSpan('b');
    expect(span1).toBe(span2);
  });

  it('NOOP_TELEMETRY is a pre-built singleton NoopTelemetryProvider', () => {
    expect(NOOP_TELEMETRY).toBeInstanceOf(NoopTelemetryProvider);
  });
});

// ---------------------------------------------------------------------------
// AppStation telemetry instrumentation
// ---------------------------------------------------------------------------

describe('AppStation telemetry instrumentation', () => {
  let appStation: AppStation;
  let hostTransport: Transport;
  let controllerTransport: Transport;
  let received: MessageBase[];
  let mock: ReturnType<typeof createMockTelemetry>;

  beforeEach(() => {
    mock = createMockTelemetry();
    const runtime = new InProcessRuntime(echoAppFactory);
    appStation = new AppStation({
      appId: 'app.echo',
      appVersion: '1.0.0',
      runtime,
      telemetry: mock.provider,
    });

    [hostTransport, controllerTransport] = createInProcessTransportPair();
    received = collectMessages(hostTransport);
    appStation.accept(controllerTransport);
  });

  afterEach(async () => {
    await appStation.shutdown();
  });

  it('records spawn.count, spawn.duration_ms, session.open, and instances.active on session_open', async () => {
    await initAndOpen(hostTransport, received);

    const counterNames = mock.metrics.filter((m) => m.method === 'counter').map((m) => m.name);
    expect(counterNames).toContain('agentapps.spawn.count');
    expect(counterNames).toContain('agentapps.session.open');

    const histNames = mock.metrics.filter((m) => m.method === 'histogram').map((m) => m.name);
    expect(histNames).toContain('agentapps.spawn.duration_ms');

    const gaugeNames = mock.metrics.filter((m) => m.method === 'gauge').map((m) => m.name);
    expect(gaugeNames).toContain('agentapps.instances.active');

    // The instances.active gauge should be 1
    const activeGauge = mock.metrics.find(
      (m) => m.method === 'gauge' && m.name === 'agentapps.instances.active',
    );
    expect(activeGauge?.value).toBe(1);
  });

  it('records session.close counter on session_close', async () => {
    const sessionId = await initAndOpen(hostTransport, received);
    mock.metrics.length = 0;

    received.length = 0;
    hostTransport.send({
      ...createEnvelope('session_close'),
      sessionId,
    } as MessageBase);
    await waitForMessage(received, 'session_closed');

    const counterNames = mock.metrics.filter((m) => m.method === 'counter').map((m) => m.name);
    expect(counterNames).toContain('agentapps.session.close');
  });

  it('records message.sent and message.received on tool_call round-trip', async () => {
    const sessionId = await initAndOpen(hostTransport, received);
    mock.metrics.length = 0;

    received.length = 0;
    hostTransport.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'echo',
      arguments: { hello: 'world' },
      context: { userId: 'u_alice', installationId: 'inst_1' },
    } as MessageBase);

    await waitForMessage(received, 'tool_result');

    const counterNames = mock.metrics.filter((m) => m.method === 'counter').map((m) => m.name);
    expect(counterNames).toContain('agentapps.message.sent');
    expect(counterNames).toContain('agentapps.message.received');

    // message.sent should carry the correct message.type attribute
    const sentMetric = mock.metrics.find(
      (m) => m.method === 'counter' && m.name === 'agentapps.message.sent',
    );
    expect(sentMetric?.attributes?.['message.type']).toBe('tool_call');

    // message.received should reflect the tool_result type
    const recvMetric = mock.metrics.find(
      (m) => m.method === 'counter' && m.name === 'agentapps.message.received',
    );
    expect(recvMetric?.attributes?.['message.type']).toBe('tool_result');
  });

  it('creates and ends a spawn span with ok status', async () => {
    await initAndOpen(hostTransport, received);

    const spawnSpan = mock.spans.find((s) => s.name === 'agentapps.spawn');
    expect(spawnSpan).toBeDefined();
    expect(spawnSpan!.ended).toBe(true);
    expect(spawnSpan!.statusCalls).toContainEqual(expect.objectContaining({ status: 'ok' }));
    expect(spawnSpan!.attributes?.['app.id']).toBe('app.echo');
    expect(spawnSpan!.attributes?.installationId).toBe('inst_1');
  });

  it('records instances.active gauge as 0 after idle teardown', async () => {
    // Recreate app station with short idle timeout
    await appStation.shutdown();
    mock = createMockTelemetry();
    const runtime = new InProcessRuntime(echoAppFactory);
    appStation = new AppStation({
      appId: 'app.echo',
      appVersion: '1.0.0',
      runtime,
      telemetry: mock.provider,
      idleTimeoutMs: 30,
    });

    [hostTransport, controllerTransport] = createInProcessTransportPair();
    received = collectMessages(hostTransport);
    appStation.accept(controllerTransport);

    const sessionId = await initAndOpen(hostTransport, received);

    received.length = 0;
    hostTransport.send({
      ...createEnvelope('session_close'),
      sessionId,
    } as MessageBase);
    await waitForMessage(received, 'session_closed');

    // Wait for idle timeout
    await new Promise((r) => setTimeout(r, 100));

    // Last instances.active gauge should be 0
    const activeGauges = mock.metrics.filter(
      (m) => m.method === 'gauge' && m.name === 'agentapps.instances.active',
    );
    expect(activeGauges.length).toBeGreaterThanOrEqual(2);
    expect(activeGauges[activeGauges.length - 1].value).toBe(0);
  });

  it('all lifecycle metrics carry the app.id attribute', async () => {
    await initAndOpen(hostTransport, received);

    const lifecycleMetrics = mock.metrics.filter(
      (m) =>
        m.name.startsWith('agentapps.spawn') ||
        m.name.startsWith('agentapps.session') ||
        m.name.startsWith('agentapps.instances'),
    );
    expect(lifecycleMetrics.length).toBeGreaterThan(0);

    for (const metric of lifecycleMetrics) {
      expect(metric.attributes?.['app.id']).toBe('app.echo');
    }
  });
});

// ---------------------------------------------------------------------------
// Default noop behavior
// ---------------------------------------------------------------------------

describe('AppStation without telemetry (default noop)', () => {
  it('operates normally when no telemetry provider is configured', async () => {
    const runtime = new InProcessRuntime(echoAppFactory);
    const appStation = new AppStation({
      appId: 'app.echo',
      appVersion: '1.0.0',
      runtime,
    });

    const [hostTransport, controllerTransport] = createInProcessTransportPair();
    const received = collectMessages(hostTransport);
    appStation.accept(controllerTransport);

    const sessionId = await initAndOpen(hostTransport, received);

    received.length = 0;
    hostTransport.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'echo',
      arguments: { test: true },
      context: { userId: 'u_alice', installationId: 'inst_1' },
    } as MessageBase);

    const result = await waitForMessage(received, 'tool_result');
    expect(result.success).toBe(true);
    expect((result.result as Record<string, unknown>).test).toBe(true);

    await appStation.shutdown();
  });
});
