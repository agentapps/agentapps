/**
 * Tests for @agentapps/host — the platform-side API.
 *
 * Each test wires AgentAppHost to a AppStation (with InProcessRuntime)
 * via a transport pair, exactly as a real platform would. This validates
 * the full triangle: host ↔ app station ↔ SDK app instance.
 */

import { createInProcessTransportPair } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentAppHost } from '../src/index.js';

// ---------------------------------------------------------------------------
// Test app (built with the SDK)
// ---------------------------------------------------------------------------

function buildTestApp() {
  const app = createApp({ id: 'app.host-test', version: '2.0.0' });

  app.tool('add', {
    description: 'Adds two numbers',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      required: ['a', 'b'],
    },
    handler: async (args) => ({ sum: (args.a as number) + (args.b as number) }),
  });

  app.tool('need-secrets', {
    description: 'Reads installation secrets',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const secrets = await ctx.secrets.getInstallation();
      return { hasSecrets: secrets != null, keys: Object.keys(secrets ?? {}) };
    },
  });

  app.health(async () => ({ status: 'ready', message: 'Test app healthy' }));

  return app.toFactory();
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let appStation: AppStation;
let host: AgentAppHost;

beforeEach(() => {
  const runtime = new InProcessRuntime(buildTestApp());
  appStation = new AppStation({
    appId: 'app.host-test',
    appVersion: '2.0.0',
    runtime,
  });

  const [hostSide, ctrlSide] = createInProcessTransportPair();
  appStation.accept(ctrlSide);

  host = new AgentAppHost(hostSide, {
    host: { name: 'test-platform', version: '1.0.0' },
    capabilities: {
      multiUser: true,
      push: true,
      prompts: ['auth', 'secret', 'url'],
      storage: true,
      objects: true,
      volume: true,
      profile: true,
      intents: true,
    },
  });
});

afterEach(async () => {
  await host.shutdown();
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentAppHost', () => {
  // -------------------------------------------------------------------------
  // Handshake
  // -------------------------------------------------------------------------

  it('initializes and negotiates version 2.0', async () => {
    const info = await host.initialize();
    expect(info.negotiatedVersion).toBe('2.0');
    expect(info.app.id).toBe('app.host-test');
    expect(info.app.version).toBe('2.0.0');
    expect(info.capabilities.directConnection).toBe(false);
    expect(host.initialized).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  it('opens a session and lists tools', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    expect(session.sessionId).toBeTruthy();
    expect(session.closed).toBe(false);
    expect(host.sessionCount).toBe(1);

    const tools = await session.listTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual(['add', 'need-secrets']);
  });

  it('calls a tool and gets the result', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    const result = await session.callTool(
      'add',
      { a: 3, b: 7 },
      { userId: 'u_alice', installationId: 'inst_1' },
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ sum: 10 });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('runs a health check', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    const health = await session.healthCheck();
    expect(health.status).toBe('ready');
    expect(health.message).toBe('Test app healthy');
    expect(health.version).toBe('2.0.0');
  });

  it('closes a session', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    await session.close();
    expect(session.closed).toBe(true);
    expect(host.sessionCount).toBe(0);
  });

  it('rejects tool call after session close', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    await session.close();

    await expect(
      session.callTool('add', { a: 1, b: 2 }, { userId: 'u_alice', installationId: 'inst_1' }),
    ).rejects.toThrow('Session is closed');
  });

  it('rejects openSession before initialize', async () => {
    await expect(
      host.openSession({ installationId: 'inst_1', tenant: { userId: 'u_alice' } }),
    ).rejects.toThrow('not initialized');
  });

  // -------------------------------------------------------------------------
  // AppStation health
  // -------------------------------------------------------------------------

  it('gets appStation health', async () => {
    await host.initialize();

    // No sessions yet
    const health1 = await host.controllerHealth();
    expect(health1.status).toBe('ready');
    expect(health1.counts.total).toBe(0);

    // Open a session
    await host.openSession({ installationId: 'inst_1', tenant: { userId: 'u_alice' } });

    const health2 = await host.controllerHealth();
    expect(health2.counts.total).toBe(1);
    expect(health2.counts.ready).toBe(1);
  });

  it('gets verbose appStation health with instance list', async () => {
    await host.initialize();
    await host.openSession({ installationId: 'inst_1', tenant: { userId: 'u_alice' } });

    const health = await host.controllerHealth(true);
    expect(health.instances).toBeDefined();
    expect(health.instances).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Session status notifications
  // -------------------------------------------------------------------------

  it('receives session_status notifications', async () => {
    await host.initialize();

    const statuses: Array<{ sessionId: string; status: string }> = [];
    host.onSessionStatus((sessionId, status) => {
      statuses.push({ sessionId, status });
    });

    await host.openSession({ installationId: 'inst_1', tenant: { userId: 'u_alice' } });

    // AppStation emits starting + ready before session_opened
    expect(statuses.length).toBeGreaterThanOrEqual(2);
    expect(statuses.some((s) => s.status === 'starting')).toBe(true);
    expect(statuses.some((s) => s.status === 'ready')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Requests (secrets)
  // -------------------------------------------------------------------------

  it('dispatches secret requests to registered handlers', async () => {
    // Recreate host with requests
    await host.shutdown();
    await appStation.shutdown();

    const runtime = new InProcessRuntime(buildTestApp());
    appStation = new AppStation({
      appId: 'app.host-test',
      appVersion: '2.0.0',
      runtime,
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    appStation.accept(ctrlSide);

    host = new AgentAppHost(hostSide, {
      host: { name: 'test-platform', version: '1.0.0' },
      capabilities: {
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
      },
      requests: {
        onGetInstallationSecrets: async () => {
          return { API_KEY: 'sk_test', TOKEN: 'tok_abc' };
        },
      },
    });

    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    const result = await session.callTool(
      'need-secrets',
      {},
      { userId: 'u_alice', installationId: 'inst_1' },
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      hasSecrets: true,
      keys: ['API_KEY', 'TOKEN'],
    });
  });

  // -------------------------------------------------------------------------
  // Multiple sessions
  // -------------------------------------------------------------------------

  it('manages multiple concurrent sessions', async () => {
    await host.initialize();

    const sessA = await host.openSession({
      installationId: 'inst_a',
      tenant: { userId: 'u_alice' },
    });
    const sessB = await host.openSession({
      installationId: 'inst_b',
      tenant: { userId: 'u_bob' },
    });

    expect(host.sessionCount).toBe(2);
    expect(sessA.sessionId).not.toBe(sessB.sessionId);

    // Both sessions work independently
    const [rA, rB] = await Promise.all([
      sessA.callTool('add', { a: 1, b: 2 }, { userId: 'u_alice', installationId: 'inst_a' }),
      sessB.callTool('add', { a: 10, b: 20 }, { userId: 'u_bob', installationId: 'inst_b' }),
    ]);

    expect(rA.result).toEqual({ sum: 3 });
    expect(rB.result).toEqual({ sum: 30 });

    await sessA.close();
    expect(host.sessionCount).toBe(1);

    await sessB.close();
    expect(host.sessionCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // getSession
  // -------------------------------------------------------------------------

  it('retrieves an active session by id', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    const found = host.getSession(session.sessionId);
    expect(found).toBe(session);

    expect(host.getSession('nonexistent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Conversation hooks — end-to-end through host → app station → app
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Installation lifecycle hooks (sendLifecycleEvent)
// ---------------------------------------------------------------------------

describe('Lifecycle hooks (sendLifecycleEvent)', () => {
  let lcController: AppStation;
  let lcHost: AgentAppHost;

  function buildLifecycleApp() {
    const app = createApp({ id: 'app.lifecycle-test', version: '2.0.0' });

    app.onInstall(async (ctx) => {
      ctx.log('info', `Installed for ${ctx.execution.installationId}`);
    });

    app.onUpgrade(async (ctx) => {
      if (ctx.previousVersion === '0.0.1') {
        throw new Error('Cannot upgrade from 0.0.1 — too old');
      }
    });

    app.onUninstall(async (ctx) => {
      ctx.log('info', 'Cleaning up resources');
    });

    return app.toFactory();
  }

  beforeEach(() => {
    const runtime = new InProcessRuntime(buildLifecycleApp());
    lcController = new AppStation({
      appId: 'app.lifecycle-test',
      appVersion: '2.0.0',
      runtime,
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    lcController.accept(ctrlSide);

    lcHost = new AgentAppHost(hostSide, {
      host: { name: 'test-platform', version: '1.0.0' },
      capabilities: {
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
      },
    });
  });

  afterEach(async () => {
    await lcHost.shutdown();
    await lcController.shutdown();
  });

  it('sends install lifecycle event and receives success', async () => {
    await lcHost.initialize();
    const session = await lcHost.openSession({
      installationId: 'inst_lc_1',
      tenant: { userId: 'u_test' },
    });

    const result = await session.sendLifecycleEvent('install', {
      userId: 'u_test',
      installationId: 'inst_lc_1',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('sends upgrade event with previousVersion and receives success', async () => {
    await lcHost.initialize();
    const session = await lcHost.openSession({
      installationId: 'inst_lc_2',
      tenant: { userId: 'u_test' },
    });

    const result = await session.sendLifecycleEvent(
      'upgrade',
      { userId: 'u_test', installationId: 'inst_lc_2' },
      { previousVersion: '1.0.0' },
    );

    expect(result.success).toBe(true);
  });

  it('returns failure when lifecycle handler throws', async () => {
    await lcHost.initialize();
    const session = await lcHost.openSession({
      installationId: 'inst_lc_3',
      tenant: { userId: 'u_test' },
    });

    const result = await session.sendLifecycleEvent(
      'upgrade',
      { userId: 'u_test', installationId: 'inst_lc_3' },
      { previousVersion: '0.0.1' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot upgrade from 0.0.1 — too old');
  });

  it('sends uninstall lifecycle event', async () => {
    await lcHost.initialize();
    const session = await lcHost.openSession({
      installationId: 'inst_lc_4',
      tenant: { userId: 'u_test' },
    });

    const result = await session.sendLifecycleEvent('uninstall', {
      userId: 'u_test',
      installationId: 'inst_lc_4',
    });

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Intents (ctx.intent → onIntentCall)
// ---------------------------------------------------------------------------

describe('Intents (ctx.intent via onIntentCall)', () => {
  /**
   * End-to-end intent test: consumer app calls ctx.intent() in a tool handler,
   * host receives the intent_call request and resolves it via onIntentCall.
   */
  let intController: AppStation;
  let intHost: AgentAppHost;

  function buildIntentApp() {
    const app = createApp({
      id: 'app.intent-consumer',
      version: '1.0.0',
      requires: [{ name: 'messenger', tools: ['send_message'] }],
    });

    app.tool('notify-user', {
      description: 'Notifies a user via a bound messenger',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['userId', 'text'],
      },
      handler: async (args, ctx) => {
        const result = await ctx.intent('messenger', 'send_message', {
          to: args.userId,
          text: args.text,
        });
        return { notified: true, messengerResult: result };
      },
    });

    return app.toFactory();
  }

  beforeEach(() => {
    const runtime = new InProcessRuntime(buildIntentApp());
    intController = new AppStation({
      appId: 'app.intent-consumer',
      appVersion: '1.0.0',
      runtime,
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    intController.accept(ctrlSide);

    intHost = new AgentAppHost(hostSide, {
      host: { name: 'test-platform', version: '1.0.0' },
      capabilities: {
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
      },
      requests: {
        onIntentCall: async (_sessionId, _requestId, binding, tool, args) => {
          // Simulate the host resolving the binding and calling the target
          if (binding === 'messenger' && tool === 'send_message') {
            return {
              success: true,
              result: { delivered: true, to: args.to },
              duration: 10,
            };
          }
          return {
            success: false,
            error: { code: 'TOOL_NOT_FOUND', message: `Unknown tool: ${tool}` },
            duration: 0,
          };
        },
      },
    });
  });

  afterEach(async () => {
    await intHost.shutdown();
    await intController.shutdown();
  });

  it('routes ctx.intent() call through the host and returns result', async () => {
    await intHost.initialize();
    const session = await intHost.openSession({
      installationId: 'inst_int_1',
      tenant: { userId: 'u_test' },
      // POLICY-REQ-8: intent_call needs the intents Permission.
      effectivePermissions: { permissions: { intents: true } },
    });

    const result = await session.callTool(
      'notify-user',
      { userId: 'alice', text: 'Hello!' },
      { userId: 'u_test', installationId: 'inst_int_1' },
    );

    expect(result.success).toBe(true);
    const data = result.result as {
      notified: boolean;
      messengerResult: { delivered: boolean; to: string };
    };
    expect(data.notified).toBe(true);
    expect(data.messengerResult.delivered).toBe(true);
    expect(data.messengerResult.to).toBe('alice');
  });

  it('intent call fails when no onIntentCall handler', async () => {
    // Create a host WITHOUT onIntentCall
    const [hostSide2, ctrlSide2] = createInProcessTransportPair();
    const controller2 = new AppStation({
      appId: 'app.intent-consumer',
      appVersion: '1.0.0',
      runtime: new InProcessRuntime(buildIntentApp()),
    });
    controller2.accept(ctrlSide2);
    const host2 = new AgentAppHost(hostSide2, {
      host: { name: 'test', version: '1.0.0' },
      capabilities: {
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
      },
      // No requests — no onIntentCall
    });

    await host2.initialize();
    const session = await host2.openSession({
      installationId: 'inst_int_2',
      tenant: { userId: 'u_test' },
      // POLICY-REQ-8: intent_call needs the intents Permission.
      effectivePermissions: { permissions: { intents: true } },
    });

    const result = await session.callTool(
      'notify-user',
      { userId: 'bob', text: 'Hi' },
      { userId: 'u_test', installationId: 'inst_int_2' },
    );

    // The tool should fail because ctx.intent() throws
    expect(result.success).toBe(false);

    await host2.shutdown();
    await controller2.shutdown();
  });
});

// ---------------------------------------------------------------------------
// Inbound event subscriptions (4.7, 4.8)
// ---------------------------------------------------------------------------

describe('Inbound event subscriptions (ctx.subscribeInbound)', () => {
  let inbController: AppStation;
  let inbHost: AgentAppHost;

  function buildInboundApp() {
    const app = createApp({
      id: 'app.inbound-test',
      version: '1.0.0',
      requires: [{ name: 'messenger', tools: ['send_message'] }],
    });

    app.tool('subscribe-and-wait', {
      description: 'Subscribe to inbound events and return the subscription id',
      parameters: {
        type: 'object',
        properties: {
          sourceKind: { type: 'string' },
          binding: { type: 'string' },
          namespace: { type: 'string' },
          eventTypes: { type: 'array', items: { type: 'string' } },
        },
        required: ['sourceKind', 'eventTypes'],
      },
      handler: async (args, ctx) => {
        const sourceKind = args.sourceKind as string;
        const eventTypes = args.eventTypes as string[];
        const source =
          sourceKind === 'binding'
            ? { kind: 'binding' as const, binding: args.binding as string }
            : { kind: 'platform' as const, namespace: args.namespace as string };

        const subscriptionId = await ctx.subscribeInbound(source, eventTypes);
        return { subscriptionId };
      },
    });

    app.tool('unsubscribe-inbound', {
      description: 'Unsubscribe from inbound events',
      parameters: {
        type: 'object',
        properties: { subscriptionId: { type: 'string' } },
        required: ['subscriptionId'],
      },
      handler: async (args, ctx) => {
        await ctx.unsubscribeInbound(args.subscriptionId as string);
        return { unsubscribed: true };
      },
    });

    return app.toFactory();
  }

  afterEach(async () => {
    await inbHost?.shutdown();
    await inbController?.shutdown();
  });

  it('ctx.subscribeInbound returns subscription id from onInboundSubscribe', async () => {
    const runtime = new InProcessRuntime(buildInboundApp());
    inbController = new AppStation({ appId: 'app.inbound-test', appVersion: '1.0.0', runtime });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    inbController.accept(ctrlSide);

    inbHost = new AgentAppHost(hostSide, {
      host: { name: 'test', version: '1.0.0' },
      capabilities: {
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
      },
      requests: {
        onInboundSubscribe: async (_sessionId, _requestId, source, eventTypes) => {
          const src = source as { kind: string; binding?: string; namespace?: string };
          const id =
            src.kind === 'binding'
              ? `isub_${src.binding}_${eventTypes.join(',')}`
              : `isub_${src.namespace}_${eventTypes.join(',')}`;
          return { success: true, subscriptionId: id };
        },
        onInboundUnsubscribe: async () => true,
      },
    });

    await inbHost.initialize();
    const session = await inbHost.openSession({
      installationId: 'inst_inb_1',
      tenant: { userId: 'u_test' },
    });

    const result = await session.callTool(
      'subscribe-and-wait',
      { sourceKind: 'binding', binding: 'messenger', eventTypes: ['message_received'] },
      { userId: 'u_test', installationId: 'inst_inb_1' },
    );

    expect(result.success).toBe(true);
    const data = result.result as { subscriptionId: string };
    expect(data.subscriptionId).toBe('isub_messenger_message_received');
  });

  it('ctx.subscribeInbound works with platform source', async () => {
    const runtime = new InProcessRuntime(buildInboundApp());
    inbController = new AppStation({ appId: 'app.inbound-test', appVersion: '1.0.0', runtime });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    inbController.accept(ctrlSide);

    inbHost = new AgentAppHost(hostSide, {
      host: { name: 'test', version: '1.0.0' },
      capabilities: {
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
      },
      requests: {
        onInboundSubscribe: async (_sid, _rid, source, eventTypes) => {
          const src = source as { kind: string; namespace?: string };
          return { success: true, subscriptionId: `isub_${src.namespace}_${eventTypes[0]}` };
        },
      },
    });

    await inbHost.initialize();
    const session = await inbHost.openSession({
      installationId: 'inst_inb_2',
      tenant: { userId: 'u_test' },
    });

    const result = await session.callTool(
      'subscribe-and-wait',
      { sourceKind: 'platform', namespace: 'boards', eventTypes: ['task_created'] },
      { userId: 'u_test', installationId: 'inst_inb_2' },
    );

    expect(result.success).toBe(true);
    const data = result.result as { subscriptionId: string };
    expect(data.subscriptionId).toBe('isub_boards_task_created');
  });

  it('sendInboundEvent pushes event to instance', async () => {
    const receivedEvents: unknown[] = [];
    const factory = buildInboundApp();

    const runtime = new InProcessRuntime((transport) => {
      // Tap into the transport to capture inbound events before the
      // factory registers its own handler. Transport supports multiple
      // listeners, so both this and the AppInstance handler will fire.
      transport.onMessage((msg) => {
        const m = msg as Record<string, unknown>;
        if (m.type === 'inbound_event') {
          receivedEvents.push(m);
        }
      });
      factory(transport);
    });

    inbController = new AppStation({ appId: 'app.inbound-test', appVersion: '1.0.0', runtime });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    inbController.accept(ctrlSide);

    inbHost = new AgentAppHost(hostSide, {
      host: { name: 'test', version: '1.0.0' },
      capabilities: {
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
      },
      requests: {
        onInboundSubscribe: async () => ({ success: true, subscriptionId: 'isub_test' }),
      },
    });

    await inbHost.initialize();
    const session = await inbHost.openSession({
      installationId: 'inst_inb_3',
      tenant: { userId: 'u_test' },
    });

    // Push an inbound event
    session.sendInboundEvent(
      'isub_test',
      { kind: 'binding', binding: 'messenger' },
      'message_received',
      { from: 'alice', body: 'hello' },
    );

    // Small delay for async delivery
    await new Promise((r) => setTimeout(r, 50));

    expect(receivedEvents).toHaveLength(1);
    const evt = receivedEvents[0] as { subscriptionId: string; eventType: string; data: unknown };
    expect(evt.subscriptionId).toBe('isub_test');
    expect(evt.eventType).toBe('message_received');
    expect(evt.data).toEqual({ from: 'alice', body: 'hello' });
  });
});

// ============================================================================
// User Permissions (R9 — Phase 5)
// ============================================================================

describe('User Permissions (R9)', () => {
  let permHost: AgentAppHost;
  let permController: AppStation;

  function buildSimpleApp() {
    const app = createApp({ id: 'app.perm-test', version: '1.0.0' });
    app.tool('echo', {
      description: 'Returns args',
      parameters: { type: 'object', properties: { x: { type: 'string' } } },
      handler: async (args) => args,
    });
    return app.toFactory();
  }

  afterEach(async () => {
    await permHost?.shutdown();
    await permController?.shutdown();
  });

  it('pushes permissions snapshot at session open when effectivePermissions is provided', async () => {
    const receivedMsgs: unknown[] = [];
    const factory = buildSimpleApp();

    const runtime = new InProcessRuntime((transport) => {
      transport.onMessage((msg) => {
        const m = msg as Record<string, unknown>;
        if (m.type === 'permissions_changed') {
          receivedMsgs.push(m);
        }
      });
      factory(transport);
    });

    permController = new AppStation({ appId: 'app.perm-test', appVersion: '1.0.0', runtime });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    permController.accept(ctrlSide);

    permHost = new AgentAppHost(hostSide, {
      host: { name: 'test', version: '1.0.0' },
      capabilities: {
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
      },
    });

    await permHost.initialize();
    await permHost.openSession({
      installationId: 'inst_perm_1',
      tenant: { userId: 'u_test' },
      effectivePermissions: {
        permissions: { profile: 'basic' },
      },
    });

    // Small delay for async delivery
    await new Promise((r) => setTimeout(r, 50));

    expect(receivedMsgs).toHaveLength(1);
    const msg = receivedMsgs[0] as {
      type: string;
      permissions: { permissions: { profile: string } };
    };
    expect(msg.type).toBe('permissions_changed');
    expect(msg.permissions.permissions.profile).toBe('basic');
  });

  it('sendPermissionsChanged pushes mid-session update', async () => {
    const receivedMsgs: unknown[] = [];
    const factory = buildSimpleApp();

    const runtime = new InProcessRuntime((transport) => {
      transport.onMessage((msg) => {
        const m = msg as Record<string, unknown>;
        if (m.type === 'permissions_changed') {
          receivedMsgs.push(m);
        }
      });
      factory(transport);
    });

    permController = new AppStation({ appId: 'app.perm-test', appVersion: '1.0.0', runtime });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    permController.accept(ctrlSide);

    permHost = new AgentAppHost(hostSide, {
      host: { name: 'test', version: '1.0.0' },
      capabilities: {
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
      },
    });

    await permHost.initialize();
    const session = await permHost.openSession({
      installationId: 'inst_perm_2',
      tenant: { userId: 'u_test' },
    });

    // Push a mid-session permissions change
    session.sendPermissionsChanged({
      permissions: { profile: 'full', volume: true },
      restrictions: { repos: ['repo-x'] },
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedMsgs).toHaveLength(1);
    const msg = receivedMsgs[0] as {
      permissions: {
        permissions: { profile: string; volume: boolean };
        restrictions: Record<string, unknown>;
      };
    };
    expect(msg.permissions.permissions.profile).toBe('full');
    expect(msg.permissions.permissions.volume).toBe(true);
    expect(msg.permissions.restrictions).toEqual({ repos: ['repo-x'] });
  });

  it('onCheckPermission blocks intent_call with PERMISSION_DENIED', async () => {
    const app = createApp({
      id: 'app.perm-check',
      version: '1.0.0',
      requires: [{ name: 'messenger', tools: ['send_message'] }],
    });

    app.tool('try-intent', {
      description: 'Try an intent call that should be blocked',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async (_args, ctx) => {
        try {
          await ctx.intent('messenger', 'send_message', { to: 'alice' });
          return { blocked: false };
        } catch (err) {
          const e = err as Error & { code?: string; details?: unknown };
          return { blocked: true, code: e.code, message: e.message, details: e.details };
        }
      },
    });

    const runtime = new InProcessRuntime(app.toFactory());
    permController = new AppStation({ appId: 'app.perm-check', appVersion: '1.0.0', runtime });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    permController.accept(ctrlSide);

    permHost = new AgentAppHost(hostSide, {
      host: { name: 'test', version: '1.0.0' },
      capabilities: {
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
      },
      requests: {
        onCheckPermission: async (_sessionId, _installationId, action) => {
          if (action.type === 'intent_call' && action.name === 'messenger.send_message') {
            return {
              layer: 'user-permission',
              permission: 'intent:messenger',
              reason: 'User has restricted messenger access',
            };
          }
          return null;
        },
        // intent handler should NOT be reached
        onIntentCall: async () => ({
          success: true,
          result: { sent: true },
          duration: 10,
        }),
      },
    });

    await permHost.initialize();
    const session = await permHost.openSession({
      installationId: 'inst_perm_3',
      tenant: { userId: 'u_test' },
      // POLICY-REQ-8: intent_call needs the intents Permission.
      effectivePermissions: { permissions: { intents: true } },
    });

    const result = await session.callTool(
      'try-intent',
      {},
      { userId: 'u_test', installationId: 'inst_perm_3' },
    );

    expect(result.success).toBe(true);
    const data = result.result as {
      blocked: boolean;
      code: string;
      message: string;
      details: { layer: string };
    };
    expect(data.blocked).toBe(true);
    expect(data.code).toBe('PERMISSION_DENIED');
    expect(data.details.layer).toBe('user-permission');
  });

  it('onCheckPermission allows when returning null', async () => {
    const app = createApp({
      id: 'app.perm-allow',
      version: '1.0.0',
      requires: [{ name: 'messenger', tools: ['send_message'] }],
    });

    app.tool('try-intent', {
      description: 'Try an intent call that should be allowed',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async (_args, ctx) => {
        const result = await ctx.intent('messenger', 'send_message', { to: 'alice' });
        return { allowed: true, result };
      },
    });

    const runtime = new InProcessRuntime(app.toFactory());
    permController = new AppStation({ appId: 'app.perm-allow', appVersion: '1.0.0', runtime });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    permController.accept(ctrlSide);

    permHost = new AgentAppHost(hostSide, {
      host: { name: 'test', version: '1.0.0' },
      capabilities: {
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
      },
      requests: {
        onCheckPermission: async () => null, // Allow everything
        onIntentCall: async () => ({
          success: true,
          result: { sent: true },
          duration: 5,
        }),
      },
    });

    await permHost.initialize();
    const session = await permHost.openSession({
      installationId: 'inst_perm_5',
      tenant: { userId: 'u_test' },
      // POLICY-REQ-8: intent_call needs the intents Permission.
      effectivePermissions: { permissions: { intents: true } },
    });

    const result = await session.callTool(
      'try-intent',
      {},
      { userId: 'u_test', installationId: 'inst_perm_5' },
    );

    expect(result.success).toBe(true);
    const data = result.result as { allowed: boolean; result: { sent: boolean } };
    expect(data.allowed).toBe(true);
    expect(data.result.sent).toBe(true);
  });
});

// ============================================================================
// Storage — document store (storage_put / get / query / update / delete)
// ============================================================================

describe('Storage (document store)', () => {
  let storageController: AppStation;
  let storageHost: AgentAppHost;

  function buildStorageApp() {
    const app = createApp({ id: 'app.storage-test', version: '1.0.0' });

    app.tool('put-and-get', {
      description: 'Puts a document then reads it back',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, document: { type: 'object' } },
        required: ['id', 'document'],
      },
      handler: async (args, ctx) => {
        const nodes = ctx.storage.collection('nodes');
        await nodes.put(args.id as string, args.document as Record<string, unknown>);
        return { readBack: await nodes.get(args.id as string) };
      },
    });

    app.tool('query-update-delete', {
      description: 'Queries by parentId, updates one, deletes one',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const nodes = ctx.storage.collection('nodes');
        const children = await nodes.query({ filter: { parentId: 'root' }, limit: 10 });
        const updated = await nodes.update('c1', { done: true });
        const missing = await nodes.update('nope', { done: true });
        const deleted = await nodes.delete('c2');
        return { children, updated, missing, deleted };
      },
    });

    app.tool('kv-roundtrip', {
      description: 'Uses the kv sugar',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        await ctx.storage.kv.set('installed', { at: 1 });
        return { value: await ctx.storage.kv.get('installed'), keys: await ctx.storage.kv.list() };
      },
    });

    return app.toFactory();
  }

  /** In-memory document store keyed by installation → collection → id. */
  function memoryCallbacks(seen: string[] = []) {
    const data = new Map<string, Map<string, Record<string, unknown>>>();
    const coll = (inst: string, name: string) => {
      const key = `${inst}/${name}`;
      let c = data.get(key);
      if (!c) {
        c = new Map();
        data.set(key, c);
      }
      return c;
    };
    return {
      data,
      requests: {
        onStoragePut: async (
          _s: string,
          inst: string,
          name: string,
          id: string,
          doc: Record<string, unknown>,
        ) => {
          seen.push(inst);
          coll(inst, name).set(id, doc);
          return true;
        },
        onStorageGet: async (_s: string, inst: string, name: string, id: string) =>
          coll(inst, name).get(id) ?? null,
        onStorageQuery: async (
          _s: string,
          inst: string,
          name: string,
          query: { filter?: Record<string, unknown>; limit?: number },
        ) => ({
          documents: [...coll(inst, name).values()].filter((d) =>
            Object.entries(query.filter ?? {}).every(([k, v]) => d[k] === v),
          ),
        }),
        onStorageUpdate: async (
          _s: string,
          inst: string,
          name: string,
          id: string,
          patch: Record<string, unknown>,
        ) => {
          const c = coll(inst, name);
          const cur = c.get(id);
          if (!cur) return null;
          const next = { ...cur, ...patch };
          c.set(id, next);
          return next;
        },
        onStorageDelete: async (_s: string, inst: string, name: string, id: string) => {
          coll(inst, name).delete(id);
          return true;
        },
      },
    };
  }

  async function start(requests: Record<string, unknown>) {
    const runtime = new InProcessRuntime(buildStorageApp());
    storageController = new AppStation({ appId: 'app.storage-test', appVersion: '1.0.0', runtime });
    const [hostSide, ctrlSide] = createInProcessTransportPair();
    storageController.accept(ctrlSide);
    storageHost = new AgentAppHost(hostSide, {
      host: { name: 'test', version: '1.0.0' },
      capabilities: {
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
      },
      requests,
    });
    await storageHost.initialize();
  }

  afterEach(async () => {
    await storageHost?.shutdown();
    await storageController?.shutdown();
  });

  it('put and get round-trip through the host, scoped by the session installation', async () => {
    const seen: string[] = [];
    const { requests } = memoryCallbacks(seen);
    await start(requests);
    const session = await storageHost.openSession({
      installationId: 'inst_storage_1',
      tenant: { userId: 'u_test' },
    });

    const result = await session.callTool(
      'put-and-get',
      { id: 'n1', document: { text: 'Buy milk', done: false } },
      { userId: 'u_test', installationId: 'inst_storage_1' },
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ readBack: { text: 'Buy milk', done: false } });
    expect(seen).toEqual(['inst_storage_1']);
  });

  it('query filters by field, update merges or returns null, delete succeeds', async () => {
    const { requests, data } = memoryCallbacks();
    await start(requests);
    const inst = 'inst_storage_2';
    const nodes = new Map<string, Record<string, unknown>>([
      ['root', { text: 'root', parentId: null }],
      ['c1', { text: 'c1', parentId: 'root', done: false }],
      ['c2', { text: 'c2', parentId: 'root', done: false }],
    ]);
    data.set(`${inst}/nodes`, nodes);
    const session = await storageHost.openSession({
      installationId: inst,
      tenant: { userId: 'u' },
    });

    const result = await session.callTool(
      'query-update-delete',
      {},
      { userId: 'u', installationId: inst },
    );

    expect(result.success).toBe(true);
    const out = result.result as Record<string, unknown>;
    expect((out.children as { documents: unknown[] }).documents).toHaveLength(2);
    expect(out.updated).toEqual({ text: 'c1', parentId: 'root', done: true });
    expect(out.missing).toBeNull();
    expect(out.deleted).toBe(true);
    expect(nodes.has('c2')).toBe(false);
  });

  it('kv sugar stores { key, value } documents in the "kv" collection', async () => {
    const { requests, data } = memoryCallbacks();
    await start(requests);
    const session = await storageHost.openSession({
      installationId: 'inst_kv',
      tenant: { userId: 'u' },
    });

    const result = await session.callTool(
      'kv-roundtrip',
      {},
      { userId: 'u', installationId: 'inst_kv' },
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ value: { at: 1 }, keys: ['installed'] });
    expect(data.get('inst_kv/kv')?.get('installed')).toEqual({
      key: 'installed',
      value: { at: 1 },
    });
  });

  it('answers success:false with an error when no storage requests are configured', async () => {
    await start({});
    const session = await storageHost.openSession({
      installationId: 'inst_none',
      tenant: { userId: 'u' },
    });

    const result = await session.callTool(
      'put-and-get',
      { id: 'n1', document: {} },
      { userId: 'u', installationId: 'inst_none' },
    );

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('No storage put handler');
  });
});
