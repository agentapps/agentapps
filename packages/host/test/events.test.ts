/**
 * Tests for @agentapps/host events system.
 *
 * Validates: session.subscribe(), session.onEvent(), session.unsubscribe(),
 * and end-to-end event flow through app station.
 */

import { createInProcessTransportPair } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentAppHost } from '../src/index.js';

// ---------------------------------------------------------------------------
// Test app (with events)
// ---------------------------------------------------------------------------

function buildEventApp() {
  const app = createApp({ id: 'app.events-test', version: '2.0.0' });

  app.event('tick', { description: 'Tick event' });
  app.event('tock', { description: 'Tock event' });

  app.tool('emit-tick', {
    description: 'Emits a tick event',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      ctx.emit('tick', { value: 42 });
      return 'tick emitted';
    },
  });

  app.tool('emit-tick-tock', {
    description: 'Emits tick then tock',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      ctx.emit('tick', { id: 1 });
      ctx.emit('tock', { id: 2 });
      return 'both emitted';
    },
  });

  app.health(async () => ({ status: 'ready', message: 'Event app healthy' }));

  return app.toFactory();
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let appStation: AppStation;
let host: AgentAppHost;

beforeEach(() => {
  const runtime = new InProcessRuntime(buildEventApp());
  appStation = new AppStation({
    appId: 'app.events-test',
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

describe('Session events', () => {
  it('session.subscribe() returns a subscriptionId', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    const subscriptionId = await session.subscribe(['tick']);
    expect(subscriptionId).toBeTruthy();
    expect(typeof subscriptionId).toBe('string');
  });

  it('session.onEvent() receives emitted events', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    await session.subscribe(['tick']);

    const events: Array<{ eventType: string; payload: unknown }> = [];
    session.onEvent((event) => {
      events.push(event);
    });

    // Call tool that emits an event
    await session.callTool('emit-tick', {}, { userId: 'u_alice', installationId: 'inst_1' });

    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('tick');
    expect(events[0].payload).toEqual({ value: 42 });
  });

  it('session.unsubscribe() stops events', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    const subscriptionId = await session.subscribe(['tick']);

    const events: Array<{ eventType: string; payload: unknown }> = [];
    session.onEvent((event) => {
      events.push(event);
    });

    // Unsubscribe
    const unsubResult = await session.unsubscribe(subscriptionId);
    expect(unsubResult).toBe(true);

    // Call tool that emits an event
    await session.callTool('emit-tick', {}, { userId: 'u_alice', installationId: 'inst_1' });

    // No events should have been received
    expect(events.length).toBe(0);
  });

  it('events are received after tool call completes', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    await session.subscribe(['*']);

    const events: Array<{ eventType: string; payload: unknown }> = [];
    session.onEvent((event) => {
      events.push(event);
    });

    // Call tool that emits multiple events
    const result = await session.callTool(
      'emit-tick-tock',
      {},
      { userId: 'u_alice', installationId: 'inst_1' },
    );

    // Tool result should be successful
    expect(result.success).toBe(true);
    expect(result.result).toBe('both emitted');

    // Events should have been received
    expect(events.length).toBe(2);
    expect(events[0].eventType).toBe('tick');
    expect(events[0].payload).toEqual({ id: 1 });
    expect(events[1].eventType).toBe('tock');
    expect(events[1].payload).toEqual({ id: 2 });
  });

  it('wildcard subscription receives all events', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    await session.subscribe(['*']);

    const events: Array<{ eventType: string; payload: unknown }> = [];
    session.onEvent((event) => {
      events.push(event);
    });

    await session.callTool('emit-tick-tock', {}, { userId: 'u_alice', installationId: 'inst_1' });

    expect(events.length).toBe(2);
    const types = events.map((e) => e.eventType).sort();
    expect(types).toEqual(['tick', 'tock']);
  });

  it('multiple event handlers receive events', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    await session.subscribe(['tick']);

    const eventsA: Array<{ eventType: string; payload: unknown }> = [];
    const eventsB: Array<{ eventType: string; payload: unknown }> = [];

    session.onEvent((event) => eventsA.push(event));
    session.onEvent((event) => eventsB.push(event));

    await session.callTool('emit-tick', {}, { userId: 'u_alice', installationId: 'inst_1' });

    expect(eventsA.length).toBe(1);
    expect(eventsB.length).toBe(1);
    expect(eventsA[0]).toEqual(eventsB[0]);
  });

  it('unregistered handler stops receiving events', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });

    await session.subscribe(['tick']);

    const eventsA: Array<{ eventType: string; payload: unknown }> = [];
    const eventsB: Array<{ eventType: string; payload: unknown }> = [];

    const unsubA = session.onEvent((event) => eventsA.push(event));
    session.onEvent((event) => eventsB.push(event));

    // Unregister handler A
    unsubA();

    await session.callTool('emit-tick', {}, { userId: 'u_alice', installationId: 'inst_1' });

    expect(eventsA.length).toBe(0);
    expect(eventsB.length).toBe(1);
  });
});
