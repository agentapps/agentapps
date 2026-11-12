/**
 * Tests for the Hello Agent App.
 *
 * Exercises the app through the full app station lifecycle, exactly as
 * a host would: initialize → session_open → tool calls → shutdown.
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

async function waitFor(type: string, timeoutMs = 2000): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = received.find((m) => m.type === type);
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`Timeout waiting for '${type}'`);
}

async function initAndOpen(): Promise<string> {
  host.send({
    ...createEnvelope('initialize'),
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'test', version: '1.0.0' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitFor('initialized');

  received.length = 0;
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'inst_test',
    tenant: { userId: 'u_test' },
  } as MessageBase);
  const opened = await waitFor('session_opened');
  received.length = 0;
  return opened.sessionId as string;
}

beforeEach(() => {
  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.hello',
    appVersion: '1.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);
  appStation.accept(ctrlSide);
});

afterEach(async () => {
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hello Agent App', () => {
  it('lists two tools: greet and countdown', async () => {
    const sessionId = await initAndOpen();

    host.send({
      ...createEnvelope('list_tools'),
      sessionId,
    } as MessageBase);
    const list = await waitFor('tools_list');
    const tools = list.tools as Array<Record<string, unknown>>;

    expect(tools).toHaveLength(2);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['countdown', 'greet']);
  });

  it('greet tool returns default English greeting', async () => {
    const sessionId = await initAndOpen();

    host.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'greet',
      arguments: { name: 'World' },
      context: { userId: 'u_test', installationId: 'inst_test' },
    } as MessageBase);
    const result = await waitFor('tool_result');

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ message: 'Hello, World!' });
  });

  it('greet tool supports multiple languages', async () => {
    const sessionId = await initAndOpen();

    host.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'greet',
      arguments: { name: 'Mundo', language: 'es' },
      context: { userId: 'u_test', installationId: 'inst_test' },
    } as MessageBase);
    const result = await waitFor('tool_result');

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ message: 'Hola, Mundo!' });
  });

  it('greet tool falls back to English for unknown languages', async () => {
    const sessionId = await initAndOpen();

    host.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'greet',
      arguments: { name: 'Verden', language: 'no' },
      context: { userId: 'u_test', installationId: 'inst_test' },
    } as MessageBase);
    const result = await waitFor('tool_result');

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ message: 'Hello, Verden!' });
  });

  it('countdown tool completes and reports progress', async () => {
    const sessionId = await initAndOpen();

    host.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'countdown',
      arguments: { from: 3, delayMs: 10 },
      context: { userId: 'u_test', installationId: 'inst_test' },
    } as MessageBase);
    const result = await waitFor('tool_result');

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ completed: true, from: 3 });

    // Verify progress events were emitted
    const progressMsgs = received.filter((m) => m.type === 'tool_progress');
    expect(progressMsgs.length).toBeGreaterThan(0);

    // Verify stream chunks were emitted
    const streamMsgs = received.filter((m) => m.type === 'tool_stream');
    expect(streamMsgs.length).toBeGreaterThan(0);
  });

  it('countdown caps at 100', async () => {
    const sessionId = await initAndOpen();

    host.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'countdown',
      arguments: { from: 999, delayMs: 1 },
      context: { userId: 'u_test', installationId: 'inst_test' },
    } as MessageBase);
    const result = await waitFor('tool_result', 15_000);

    expect(result.success).toBe(true);
    expect((result.result as Record<string, unknown>).from).toBe(100);
  });

  it('greet tool emits log events', async () => {
    const sessionId = await initAndOpen();

    host.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'greet',
      arguments: { name: 'Alice' },
      context: { userId: 'u_test', installationId: 'inst_test' },
    } as MessageBase);
    await waitFor('tool_result');

    const logs = received.filter((m) => m.type === 'log');
    expect(logs.length).toBeGreaterThan(0);
    const logMsg = logs[0] as Record<string, unknown>;
    expect(logMsg.level).toBe('info');
    expect(logMsg.message).toContain('Alice');
  });

  it('health check returns ready when secrets unavailable', async () => {
    const sessionId = await initAndOpen();

    // Don't provide a secrets response — the health check catches the timeout/error
    host.send({
      ...createEnvelope('health_check'),
      sessionId,
    } as MessageBase);

    // The health handler calls ctx.secrets.getSystem() which will hang
    // since no one responds to the callback. The catch block returns 'ready'.
    // But we need to respond to make the test not hang. Let's respond with an error.
    host.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'get_system_secrets') {
        host.send({
          ...createEnvelope('system_secrets'),
          sessionId,
          requestId: m.requestId as string,
          error: 'Secrets not configured',
        } as MessageBase);
      }
    });

    // Re-send health check now that the handler is wired
    received.length = 0;
    host.send({
      ...createEnvelope('health_check'),
      sessionId,
    } as MessageBase);

    const health = await waitFor('health_status');
    expect(health.status).toBe('ready');
  });
});
