/**
 * End-to-end tests for the Agent App AppStation with in-process runtime.
 *
 * These tests exercise the full flow: host ↔ app station ↔ instance,
 * covering the protocol spec's acceptance criteria (AC-1, AC-2, AC-5, AC-6)
 * and the gap-fix features: idle timeout, backpressure, max instances,
 * session_status notifications, request security, spawn timeout.
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  ErrorCode,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AppFactory,
  AppStation,
  InProcessRuntime,
  type InstanceHandle,
  type RuntimeAdapter,
  type SpawnConfig,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Test app factories
// ---------------------------------------------------------------------------

/** Echo app: returns tool arguments as the result. */
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
    } else if (msg.type === 'list_tools') {
      transport.send({
        id: msg.id,
        type: 'tools_list',
        timestamp: new Date().toISOString(),
        version: PROTOCOL_VERSION,
        sessionId: m.sessionId,
        tools: [
          {
            name: 'echo',
            description: 'Echo the arguments back',
            parameters: { type: 'object', properties: {} },
          },
        ],
      } as MessageBase);
    } else if (msg.type === 'health_check') {
      transport.send({
        id: msg.id,
        type: 'health_status',
        timestamp: new Date().toISOString(),
        version: PROTOCOL_VERSION,
        sessionId: m.sessionId,
        status: 'ready',
        message: 'All good',
        uptime: 42,
      } as MessageBase);
    }
  });
};

/** App that sends a request request (get_installation_secrets) on tool_call. */
const secretAppFactory: AppFactory = (transport) => {
  transport.onMessage((msg) => {
    const m = msg as Record<string, unknown>;
    if (msg.type === 'tool_call') {
      // Ask the host for secrets via request (REQ-7)
      transport.send({
        id: `cb_${msg.id}`,
        type: 'get_installation_secrets',
        timestamp: new Date().toISOString(),
        version: PROTOCOL_VERSION,
        sessionId: m.sessionId,
        requestId: `cb_${msg.id}`,
      } as MessageBase);
    } else if (msg.type === 'installation_secrets') {
      // Got secrets back — now respond with tool_result
      const secrets = (msg as Record<string, unknown>).secrets;
      transport.send({
        id: (msg as Record<string, unknown>).requestId as string,
        type: 'tool_result',
        timestamp: new Date().toISOString(),
        version: PROTOCOL_VERSION,
        sessionId: m.sessionId,
        success: true,
        result: { gotSecrets: secrets != null },
        duration: 5,
      } as MessageBase);
    }
  });
};

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

/** Collects messages from a transport into an array. */
function collectMessages(transport: Transport): MessageBase[] {
  const messages: MessageBase[] = [];
  transport.onMessage((msg) => messages.push(msg));
  return messages;
}

/** Wait for a message of the given type in the collected array. */
async function waitForMessage(
  messages: MessageBase[],
  type: string,
  timeoutMs = 1000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = messages.find((m) => m.type === type);
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`Timeout waiting for message type '${type}'`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppStation with InProcessRuntime', () => {
  let appStation: AppStation;
  let hostTransport: Transport;
  let controllerTransport: Transport;
  let received: MessageBase[];

  beforeEach(() => {
    const runtime = new InProcessRuntime(echoAppFactory);
    appStation = new AppStation({
      appId: 'app.echo',
      appVersion: '1.0.0',
      runtime,
    });

    [hostTransport, controllerTransport] = createInProcessTransportPair();
    received = collectMessages(hostTransport);
    appStation.accept(controllerTransport);
  });

  afterEach(async () => {
    await appStation.shutdown();
  });

  // -------------------------------------------------------------------------
  // AC-1: Handshake
  // -------------------------------------------------------------------------

  it('negotiates version 2.0 on initialize (AC-1)', async () => {
    hostTransport.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test-host', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);

    const resp = await waitForMessage(received, 'initialized');
    expect(resp.negotiatedVersion).toBe('2.0');
    expect((resp.app as Record<string, unknown>).id).toBe('app.echo');
    const caps = resp.capabilities as Record<string, unknown>;
    expect(caps.directConnection).toBe(false);
    expect(caps.asyncOpen).toBe(false);
  });

  it('rejects unsupported version (AC-1)', async () => {
    hostTransport.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['1.0'],
      host: { name: 'test-host', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);

    const resp = await waitForMessage(received, 'error');
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCode.VERSION_UNSUPPORTED);
  });

  // -------------------------------------------------------------------------
  // AC-2: Session open + tool call
  // -------------------------------------------------------------------------

  it('opens a session and proxies tool_call end-to-end (AC-2)', async () => {
    // Initialize
    hostTransport.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    // Open session
    const openMsg = {
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    };
    hostTransport.send(openMsg as MessageBase);
    const opened = await waitForMessage(received, 'session_opened');
    const sessionId = opened.sessionId as string;
    expect(sessionId).toBeTruthy();

    // Tool call
    hostTransport.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'echo',
      arguments: { greeting: 'hello world' },
      context: {
        userId: 'u_alice',
        installationId: 'inst_1',
      },
    } as MessageBase);

    const result = await waitForMessage(received, 'tool_result');
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ greeting: 'hello world' });
    expect(result.sessionId).toBe(sessionId);
  });

  // -------------------------------------------------------------------------
  // Idempotent open (REQ-5)
  // -------------------------------------------------------------------------

  it('returns the same session on duplicate session_open (REQ-5)', async () => {
    // Initialize
    hostTransport.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    // Open session
    hostTransport.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    const first = await waitForMessage(received, 'session_opened');

    // Open again for same installation
    hostTransport.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    } as MessageBase);

    // Find the second session_opened (skip the first)
    await new Promise((r) => setTimeout(r, 20));
    const openedMsgs = received.filter((m) => m.type === 'session_opened');
    expect(openedMsgs).toHaveLength(2);
    expect((openedMsgs[1] as Record<string, unknown>).sessionId).toBe(first.sessionId);
  });

  // -------------------------------------------------------------------------
  // list_tools + health_check
  // -------------------------------------------------------------------------

  it('proxies list_tools to the instance', async () => {
    // Initialize + open
    hostTransport.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    hostTransport.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    const opened = await waitForMessage(received, 'session_opened');
    const sessionId = opened.sessionId as string;

    // list_tools
    hostTransport.send({
      ...createEnvelope('list_tools'),
      sessionId,
    } as MessageBase);

    const toolsList = await waitForMessage(received, 'tools_list');
    const tools = toolsList.tools as Array<Record<string, unknown>>;
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('echo');
  });

  it('proxies health_check to the instance', async () => {
    // Initialize + open
    hostTransport.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    hostTransport.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    const opened = await waitForMessage(received, 'session_opened');
    const sessionId = opened.sessionId as string;

    // health_check
    hostTransport.send({
      ...createEnvelope('health_check'),
      sessionId,
    } as MessageBase);

    const health = await waitForMessage(received, 'health_status');
    expect(health.status).toBe('ready');
    expect(health.sessionId).toBe(sessionId);
  });

  // -------------------------------------------------------------------------
  // Session close
  // -------------------------------------------------------------------------

  it('closes a session and rejects subsequent messages', async () => {
    // Initialize + open
    hostTransport.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    hostTransport.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    const opened = await waitForMessage(received, 'session_opened');
    const sessionId = opened.sessionId as string;

    // Close
    hostTransport.send({
      ...createEnvelope('session_close'),
      sessionId,
    } as MessageBase);
    await waitForMessage(received, 'session_closed');
    expect(appStation.sessionCount).toBe(0);
    // Instance survives session_close (REQ-4) — idle timer decides teardown
    expect(appStation.instanceCount).toBe(1);

    // Attempt tool_call on closed session
    hostTransport.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'echo',
      arguments: {},
      context: { userId: 'u_alice', installationId: 'inst_1' },
    } as MessageBase);

    const _err = received.find(
      (m) => m.type === 'error' && (m as Record<string, unknown>).id !== opened.id,
    ) as Record<string, unknown> | undefined;
    // Give it a tick
    await new Promise((r) => setTimeout(r, 20));
    const errors = received.filter((m) => m.type === 'error');
    expect(errors.length).toBeGreaterThan(0);
    const lastErr = errors[errors.length - 1] as Record<string, unknown>;
    expect((lastErr.error as Record<string, unknown>).code).toBe(ErrorCode.SESSION_NOT_FOUND);
  });

  // -------------------------------------------------------------------------
  // AppStation health (REQ-8)
  // -------------------------------------------------------------------------

  it('returns aggregated appStation health', async () => {
    hostTransport.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    // No sessions yet
    hostTransport.send(createEnvelope('controller_health'));
    const health1 = await waitForMessage(received, 'controller_health_status');
    expect(health1.status).toBe('ready');
    expect((health1.counts as Record<string, number>).total).toBe(0);

    // Open a session
    hostTransport.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    await waitForMessage(received, 'session_opened');

    // Check health again
    received.length = 0; // clear for clean lookup
    hostTransport.send(createEnvelope('controller_health'));
    const health2 = await waitForMessage(received, 'controller_health_status');
    expect((health2.counts as Record<string, number>).total).toBe(1);
    expect((health2.counts as Record<string, number>).ready).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Unknown message type
  // -------------------------------------------------------------------------

  it('rejects unknown message types with UNKNOWN_MESSAGE_TYPE', async () => {
    hostTransport.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    hostTransport.send(createEnvelope('banana'));
    const err = await waitForMessage(received, 'error');
    expect((err.error as Record<string, unknown>).code).toBe(ErrorCode.UNKNOWN_MESSAGE_TYPE);
  });

  // -------------------------------------------------------------------------
  // Requires initialize first
  // -------------------------------------------------------------------------

  it('rejects session_open before initialize', async () => {
    hostTransport.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    } as MessageBase);

    const err = await waitForMessage(received, 'error');
    expect((err.error as Record<string, unknown>).code).toBe(ErrorCode.INVALID_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// Request round-trip (AC-5)
// ---------------------------------------------------------------------------

describe('AppStation request proxy (AC-5)', () => {
  it('proxies instance→host secret request and host→instance response', async () => {
    const runtime = new InProcessRuntime(secretAppFactory);
    const ctrl = new AppStation({
      appId: 'app.secrets',
      appVersion: '1.0.0',
      runtime,
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    const received: MessageBase[] = [];
    hostSide.onMessage((msg) => received.push(msg));
    ctrl.accept(ctrlSide);

    // Initialize
    hostSide.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    // Open session
    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_sec',
      tenant: { userId: 'u_bob' },
    } as MessageBase);
    const opened = await waitForMessage(received, 'session_opened');
    const sessionId = opened.sessionId as string;

    // Send tool_call → the app will emit get_installation_secrets request
    hostSide.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'secret-tool',
      arguments: {},
      context: { userId: 'u_bob', installationId: 'inst_sec' },
    } as MessageBase);

    // Wait for the request request to arrive at the host
    const cb = await waitForMessage(received, 'get_installation_secrets');
    expect(cb.sessionId).toBe(sessionId);

    // Host responds with secrets → app station proxies back to instance
    hostSide.send({
      ...createEnvelope('installation_secrets'),
      sessionId,
      requestId: cb.requestId,
      secrets: { api_key: 'sk_test_123' },
    } as MessageBase);

    // Instance should now send tool_result
    const result = await waitForMessage(received, 'tool_result');
    expect(result.success).toBe(true);
    expect((result.result as Record<string, unknown>).gotSecrets).toBe(true);

    await ctrl.shutdown();
  });
});

// ---------------------------------------------------------------------------
// AC-6: Multi-tenant standalone (simulated with on-demand + 2 sessions)
// ---------------------------------------------------------------------------

describe('Multiple sessions', () => {
  it('routes messages to the correct session instance', async () => {
    const runtime = new InProcessRuntime(echoAppFactory);
    const ctrl = new AppStation({
      appId: 'app.echo',
      appVersion: '1.0.0',
      runtime,
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    const received: MessageBase[] = [];
    hostSide.onMessage((msg) => received.push(msg));
    ctrl.accept(ctrlSide);

    // Initialize
    hostSide.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false, multiUser: true },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    // Open session A
    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_a',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    const openedA = await waitForMessage(received, 'session_opened');
    const sessA = openedA.sessionId as string;

    // Open session B
    received.length = 0;
    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_b',
      tenant: { userId: 'u_bob' },
    } as MessageBase);
    const openedB = await waitForMessage(received, 'session_opened');
    const sessB = openedB.sessionId as string;
    expect(sessA).not.toBe(sessB);

    // Tool call on session A
    received.length = 0;
    hostSide.send({
      ...createEnvelope('tool_call'),
      sessionId: sessA,
      tool: 'echo',
      arguments: { who: 'alice' },
      context: { userId: 'u_alice', installationId: 'inst_a' },
    } as MessageBase);

    const resultA = await waitForMessage(received, 'tool_result');
    expect((resultA.result as Record<string, unknown>).who).toBe('alice');
    expect(resultA.sessionId).toBe(sessA);

    // Tool call on session B
    received.length = 0;
    hostSide.send({
      ...createEnvelope('tool_call'),
      sessionId: sessB,
      tool: 'echo',
      arguments: { who: 'bob' },
      context: { userId: 'u_bob', installationId: 'inst_b' },
    } as MessageBase);

    const resultB = await waitForMessage(received, 'tool_result');
    expect((resultB.result as Record<string, unknown>).who).toBe('bob');
    expect(resultB.sessionId).toBe(sessB);

    expect(ctrl.sessionCount).toBe(2);
    await ctrl.shutdown();
  });
});

// ---------------------------------------------------------------------------
// Instance lifecycle — idle timeout & reuse (REQ-4, REQ-5)
// ---------------------------------------------------------------------------

describe('Instance lifecycle', () => {
  it('reuses instance after session_close + re-open (REQ-5)', async () => {
    const runtime = new InProcessRuntime(echoAppFactory);
    const ctrl = new AppStation({
      appId: 'app.echo',
      appVersion: '1.0.0',
      runtime,
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    const received: MessageBase[] = [];
    hostSide.onMessage((msg) => received.push(msg));
    ctrl.accept(ctrlSide);

    // Initialize
    hostSide.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    // Open session A
    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    const openedA = await waitForMessage(received, 'session_opened');
    const sessA = openedA.sessionId as string;
    expect(ctrl.instanceCount).toBe(1);

    // Close session A — instance stays alive
    received.length = 0;
    hostSide.send({
      ...createEnvelope('session_close'),
      sessionId: sessA,
    } as MessageBase);
    await waitForMessage(received, 'session_closed');
    expect(ctrl.sessionCount).toBe(0);
    expect(ctrl.instanceCount).toBe(1);

    // Re-open for the same installationId — reuses the instance
    received.length = 0;
    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    const openedB = await waitForMessage(received, 'session_opened');
    const sessB = openedB.sessionId as string;

    // New session id, same instance
    expect(sessB).not.toBe(sessA);
    expect(ctrl.instanceCount).toBe(1);

    // Tool call on the reused instance works
    received.length = 0;
    hostSide.send({
      ...createEnvelope('tool_call'),
      sessionId: sessB,
      tool: 'echo',
      arguments: { reuse: true },
      context: { userId: 'u_alice', installationId: 'inst_1' },
    } as MessageBase);

    const result = await waitForMessage(received, 'tool_result');
    expect(result.success).toBe(true);
    expect((result.result as Record<string, unknown>).reuse).toBe(true);

    await ctrl.shutdown();
  });

  it('tears down instance after idle timeout', async () => {
    const runtime = new InProcessRuntime(echoAppFactory);
    const ctrl = new AppStation({
      appId: 'app.echo',
      appVersion: '1.0.0',
      runtime,
      idleTimeoutMs: 50, // very short for testing
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    const received: MessageBase[] = [];
    hostSide.onMessage((msg) => received.push(msg));
    ctrl.accept(ctrlSide);

    // Initialize + open session
    hostSide.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    const opened = await waitForMessage(received, 'session_opened');
    const sessionId = opened.sessionId as string;

    expect(ctrl.instanceCount).toBe(1);

    // Close session — starts idle timer
    hostSide.send({
      ...createEnvelope('session_close'),
      sessionId,
    } as MessageBase);
    await waitForMessage(received, 'session_closed');
    expect(ctrl.instanceCount).toBe(1);

    // Wait for idle timeout to fire
    await new Promise((r) => setTimeout(r, 120));
    expect(ctrl.instanceCount).toBe(0);

    await ctrl.shutdown();
  });
});

// ---------------------------------------------------------------------------
// Session status notifications (REQ-5)
// ---------------------------------------------------------------------------

describe('Session status notifications (REQ-5)', () => {
  it('emits starting and ready on session_open', async () => {
    const runtime = new InProcessRuntime(echoAppFactory);
    const ctrl = new AppStation({
      appId: 'app.echo',
      appVersion: '1.0.0',
      runtime,
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    const received: MessageBase[] = [];
    hostSide.onMessage((msg) => received.push(msg));
    ctrl.accept(ctrlSide);

    // Initialize
    hostSide.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    // Open session
    received.length = 0;
    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    await waitForMessage(received, 'session_opened');

    // Check that session_status notifications were emitted
    const statusMsgs = received
      .filter((m) => m.type === 'session_status')
      .map((m) => (m as Record<string, unknown>).status);

    expect(statusMsgs).toContain('starting');
    expect(statusMsgs).toContain('ready');

    // starting must come before ready
    const startIdx = statusMsgs.indexOf('starting');
    const readyIdx = statusMsgs.indexOf('ready');
    expect(startIdx).toBeLessThan(readyIdx);

    await ctrl.shutdown();
  });
});

// ---------------------------------------------------------------------------
// Backpressure (REQ-10)
// ---------------------------------------------------------------------------

/** Silent app: never responds to tool_call (for backpressure testing). */
const silentAppFactory: AppFactory = (transport) => {
  transport.onMessage((_msg) => {
    // Intentionally do nothing — tool_call stays in-flight
  });
};

describe('Backpressure (REQ-10)', () => {
  it('rejects tool_call when max in-flight reached', async () => {
    const runtime = new InProcessRuntime(silentAppFactory);
    const ctrl = new AppStation({
      appId: 'app.silent',
      appVersion: '1.0.0',
      runtime,
      maxInflightPerSession: 1,
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    const received: MessageBase[] = [];
    hostSide.onMessage((msg) => received.push(msg));
    ctrl.accept(ctrlSide);

    // Initialize + open
    hostSide.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    const opened = await waitForMessage(received, 'session_opened');
    const sessionId = opened.sessionId as string;

    // First tool_call — goes through (silent app won't respond)
    received.length = 0;
    hostSide.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'noop',
      arguments: {},
      context: { userId: 'u_alice', installationId: 'inst_1' },
    } as MessageBase);

    // Second tool_call — should be rate-limited
    hostSide.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'noop',
      arguments: {},
      context: { userId: 'u_alice', installationId: 'inst_1' },
    } as MessageBase);

    await new Promise((r) => setTimeout(r, 20));

    const errors = received.filter((m) => m.type === 'error');
    expect(errors).toHaveLength(1);
    const err = errors[0] as Record<string, unknown>;
    expect((err.error as Record<string, unknown>).code).toBe(ErrorCode.RATE_LIMITED);

    await ctrl.shutdown();
  });
});

// ---------------------------------------------------------------------------
// Max instances (REQ-10)
// ---------------------------------------------------------------------------

describe('Max instances (REQ-10)', () => {
  it('rejects session_open when max instances reached', async () => {
    const runtime = new InProcessRuntime(echoAppFactory);
    const ctrl = new AppStation({
      appId: 'app.echo',
      appVersion: '1.0.0',
      runtime,
      maxInstances: 1,
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    const received: MessageBase[] = [];
    hostSide.onMessage((msg) => received.push(msg));
    ctrl.accept(ctrlSide);

    // Initialize
    hostSide.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false, multiUser: true },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    // Open first session — succeeds
    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_a',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    await waitForMessage(received, 'session_opened');
    expect(ctrl.instanceCount).toBe(1);

    // Open second session (different installation) — should fail
    received.length = 0;
    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_b',
      tenant: { userId: 'u_bob' },
    } as MessageBase);

    const err = await waitForMessage(received, 'error');
    expect((err.error as Record<string, unknown>).code).toBe(ErrorCode.CONTROLLER_AT_CAPACITY);
    expect(ctrl.instanceCount).toBe(1);

    await ctrl.shutdown();
  });
});

// ---------------------------------------------------------------------------
// Spawn timeout (REQ-4)
// ---------------------------------------------------------------------------

/** Runtime that never resolves spawn — simulates a slow/stuck instance. */
class NeverSpawnRuntime implements RuntimeAdapter {
  async spawn(_config: SpawnConfig): Promise<InstanceHandle> {
    // Return a promise that never resolves (race with timeout wins)
    return new Promise<InstanceHandle>(() => {});
  }
}

describe('Spawn timeout (REQ-4)', () => {
  it('returns TIMEOUT on slow spawn', async () => {
    const ctrl = new AppStation({
      appId: 'app.slow',
      appVersion: '1.0.0',
      runtime: new NeverSpawnRuntime(),
      openTimeoutMs: 50, // very short for testing
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    const received: MessageBase[] = [];
    hostSide.onMessage((msg) => received.push(msg));
    ctrl.accept(ctrlSide);

    // Initialize
    hostSide.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    // Attempt session open — should timeout
    received.length = 0;
    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_slow',
      tenant: { userId: 'u_alice' },
    } as MessageBase);

    const err = await waitForMessage(received, 'error', 2000);
    expect((err.error as Record<string, unknown>).code).toBe(ErrorCode.TIMEOUT);

    await ctrl.shutdown();
  });
});

// ---------------------------------------------------------------------------
// Request security (REQ-7)
// ---------------------------------------------------------------------------

/**
 * Malicious app: sends a legit request AND a request with a fake sessionId.
 * The app station should drop the fake one and relay only the legit one.
 */
const maliciousCallbackFactory: AppFactory = (transport) => {
  transport.onMessage((msg) => {
    const m = msg as Record<string, unknown>;
    if (msg.type === 'tool_call') {
      // Legit request (correct sessionId)
      transport.send({
        id: `legit_${msg.id}`,
        type: 'get_installation_secrets',
        timestamp: new Date().toISOString(),
        version: PROTOCOL_VERSION,
        sessionId: m.sessionId,
        requestId: `legit_${msg.id}`,
      } as MessageBase);

      // Fake request (wrong sessionId)
      transport.send({
        id: `fake_${msg.id}`,
        type: 'get_installation_secrets',
        timestamp: new Date().toISOString(),
        version: PROTOCOL_VERSION,
        sessionId: 'sess_DOES_NOT_EXIST',
        requestId: `fake_${msg.id}`,
      } as MessageBase);
    }
  });
};

describe('Request security (REQ-7)', () => {
  it('drops request with sessionId not owned by instance', async () => {
    const runtime = new InProcessRuntime(maliciousCallbackFactory);
    const ctrl = new AppStation({
      appId: 'app.malicious',
      appVersion: '1.0.0',
      runtime,
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    const received: MessageBase[] = [];
    hostSide.onMessage((msg) => received.push(msg));
    ctrl.accept(ctrlSide);

    // Initialize + open
    hostSide.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_evil',
      tenant: { userId: 'u_eve' },
    } as MessageBase);
    const opened = await waitForMessage(received, 'session_opened');
    const sessionId = opened.sessionId as string;

    // Trigger tool_call → app sends one legit + one fake request
    received.length = 0;
    hostSide.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'steal-secrets',
      arguments: {},
      context: { userId: 'u_eve', installationId: 'inst_evil' },
    } as MessageBase);

    await new Promise((r) => setTimeout(r, 50));

    // Only the legit request should arrive at the host
    const requests = received.filter((m) => m.type === 'get_installation_secrets');
    expect(requests).toHaveLength(1);
    expect((requests[0] as Record<string, unknown>).sessionId).toBe(sessionId);

    await ctrl.shutdown();
  });
});

// ---------------------------------------------------------------------------
// AppStation health verbose (REQ-8)
// ---------------------------------------------------------------------------

describe('AppStation health verbose (REQ-8)', () => {
  it('includes full instance list when verbose=true', async () => {
    const runtime = new InProcessRuntime(echoAppFactory);
    const ctrl = new AppStation({
      appId: 'app.echo',
      appVersion: '1.0.0',
      runtime,
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    const received: MessageBase[] = [];
    hostSide.onMessage((msg) => received.push(msg));
    ctrl.accept(ctrlSide);

    // Initialize
    hostSide.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false, multiUser: true },
    } as MessageBase);
    await waitForMessage(received, 'initialized');

    // Open two sessions (different installations)
    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_a',
      tenant: { userId: 'u_alice' },
    } as MessageBase);
    await waitForMessage(received, 'session_opened');

    received.length = 0;
    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_b',
      tenant: { userId: 'u_bob' },
    } as MessageBase);
    await waitForMessage(received, 'session_opened');

    // Non-verbose: no instances array
    received.length = 0;
    hostSide.send(createEnvelope('controller_health'));
    const h1 = await waitForMessage(received, 'controller_health_status');
    expect((h1.counts as Record<string, number>).total).toBe(2);
    expect(h1.instances).toBeUndefined();

    // Verbose: instances array present
    received.length = 0;
    hostSide.send({
      ...createEnvelope('controller_health'),
      verbose: true,
    } as MessageBase);
    const h2 = await waitForMessage(received, 'controller_health_status');
    const instances = h2.instances as Array<Record<string, unknown>>;
    expect(instances).toHaveLength(2);
    expect(instances.every((i) => i.status === 'ready')).toBe(true);

    await ctrl.shutdown();
  });
});
