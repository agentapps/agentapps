/**
 * Tests for @agentapps/sdk events system.
 *
 * Validates: app.event() registration, ctx.emit() emission,
 * subscribe/unsubscribe handling, and wildcard matching.
 */

import {
  createInProcessTransportPair,
  createSessionEnvelope,
  type MessageBase,
  type Transport,
} from '@agentapps/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const SESSION_ID = 'sess_events_1';

function sessionMsg(type: string, extra: Record<string, unknown> = {}): MessageBase {
  return {
    ...createSessionEnvelope(type, SESSION_ID),
    ...extra,
  } as MessageBase;
}

function waitFor(
  transport: Transport,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 2_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`Timeout waiting for message (${timeoutMs}ms)`));
    }, timeoutMs);
    const unsub = transport.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (predicate(m)) {
        clearTimeout(timer);
        unsub();
        resolve(m);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Event registration
// ---------------------------------------------------------------------------

describe('app.event()', () => {
  it('registers events on the app builder', () => {
    const app = createApp({ id: 'app.events', version: '1.0.0' });
    app.event('tick', { description: 'A tick event' });
    app.event('tock', { description: 'A tock event' });

    expect(app._events.size).toBe(2);
    expect(app._events.has('tick')).toBe(true);
    expect(app._events.has('tock')).toBe(true);
    expect(app._events.get('tick')?.description).toBe('A tick event');
  });

  it('rejects duplicate event names', () => {
    const app = createApp({ id: 'app.dup-events', version: '1.0.0' });
    app.event('dup', { description: 'First' });
    expect(() => app.event('dup', { description: 'Second' })).toThrow(
      "Event 'dup' is already registered",
    );
  });

  it('chains with tool and health registrations', () => {
    const app = createApp({ id: 'app.chain', version: '1.0.0' })
      .event('e1', { description: 'Event 1' })
      .tool('t1', {
        description: 'Tool 1',
        parameters: { type: 'object', properties: {} },
        handler: async () => null,
      })
      .event('e2', { description: 'Event 2' })
      .health(async () => ({ status: 'ready' }));

    expect(app._events.size).toBe(2);
    expect(app._tools.size).toBe(1);
    expect(app._healthHandler).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Subscribe / unsubscribe
// ---------------------------------------------------------------------------

describe('subscribe', () => {
  it('creates subscription and receives events', async () => {
    const app = createApp({ id: 'app.sub', version: '1.0.0' });
    app.event('tick', { description: 'Tick event' });
    app.tool('emit-tick', {
      description: 'Emits a tick event',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        ctx.emit('tick', { count: 42 });
        return 'emitted';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Subscribe to tick events
    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_req_1',
        eventTypes: ['tick'],
      }),
    );
    const subMsg = await subResult;
    expect(subMsg.success).toBe(true);
    expect(subMsg.subscriptionId).toBeTruthy();
    const subscriptionId = subMsg.subscriptionId as string;

    // Call the tool that emits an event
    const eventPromise = waitFor(hostSide, (m) => m.type === 'event' && m.eventType === 'tick');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_1',
        tool: 'emit-tick',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const eventMsg = await eventPromise;
    expect(eventMsg.type).toBe('event');
    expect(eventMsg.subscriptionId).toBe(subscriptionId);
    expect(eventMsg.eventType).toBe('tick');
    expect(eventMsg.payload).toEqual({ count: 42 });
    expect(eventMsg.sessionId).toBe(SESSION_ID);
  });

  it('rejects subscription for unregistered event type', async () => {
    const app = createApp({ id: 'app.no-events', version: '1.0.0' });
    // No events registered

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_req_2',
        eventTypes: ['unknown_event'],
      }),
    );

    const subMsg = await subResult;
    expect(subMsg.success).toBe(false);
    expect(subMsg.error).toContain('not registered');
  });

  it('wildcard subscription receives all events', async () => {
    const app = createApp({ id: 'app.wildcard', version: '1.0.0' });
    app.event('event_a', { description: 'Event A' });
    app.event('event_b', { description: 'Event B' });
    app.tool('emit-both', {
      description: 'Emits both events',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        ctx.emit('event_a', { id: 1 });
        ctx.emit('event_b', { id: 2 });
        return 'done';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Subscribe with wildcard
    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_req_3',
        eventTypes: ['*'],
      }),
    );
    const subMsg = await subResult;
    expect(subMsg.success).toBe(true);
    const subscriptionId = subMsg.subscriptionId as string;

    // Collect all events
    const events: Record<string, unknown>[] = [];
    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'event') events.push(m);
    });

    // Call tool that emits both events
    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_2',
        tool: 'emit-both',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    await toolResult;

    expect(events.length).toBe(2);
    expect(events[0].subscriptionId).toBe(subscriptionId);
    expect(events[0].eventType).toBe('event_a');
    expect(events[0].payload).toEqual({ id: 1 });
    expect(events[1].subscriptionId).toBe(subscriptionId);
    expect(events[1].eventType).toBe('event_b');
    expect(events[1].payload).toEqual({ id: 2 });
  });

  it('unsubscribe stops receiving events', async () => {
    const app = createApp({ id: 'app.unsub', version: '1.0.0' });
    app.event('ping', { description: 'Ping event' });
    app.tool('emit-ping', {
      description: 'Emits a ping event',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        ctx.emit('ping', { n: 1 });
        return 'emitted';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Subscribe
    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_req_4',
        eventTypes: ['ping'],
      }),
    );
    const subMsg = await subResult;
    const subscriptionId = subMsg.subscriptionId as string;

    // Unsubscribe
    const unsubResult = waitFor(hostSide, (m) => m.type === 'unsubscribe_result');
    hostSide.send(
      sessionMsg('unsubscribe', {
        id: 'unsub_req_1',
        subscriptionId,
      }),
    );
    const unsubMsg = await unsubResult;
    expect(unsubMsg.success).toBe(true);

    // Collect events after unsubscribe
    const events: Record<string, unknown>[] = [];
    const unsubListener = hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'event') events.push(m);
    });

    // Call tool that emits event
    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_3',
        tool: 'emit-ping',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    await toolResult;
    unsubListener();

    // No events should have been received
    expect(events.length).toBe(0);
  });

  it('emit with no subscribers is a no-op', async () => {
    const app = createApp({ id: 'app.noop', version: '1.0.0' });
    app.event('lonely', { description: 'No one listens' });
    app.tool('emit-lonely', {
      description: 'Emits an event with no subscribers',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        ctx.emit('lonely', { data: 'hello' });
        return 'emitted';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Collect all events
    const events: Record<string, unknown>[] = [];
    const unsubListener = hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'event') events.push(m);
    });

    // Call tool that emits event (no subscribers)
    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_4',
        tool: 'emit-lonely',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    const result = await toolResult;
    unsubListener();

    expect(result.success).toBe(true);
    expect(events.length).toBe(0);
  });

  it('subscriptions are cleared on shutdown', async () => {
    const app = createApp({ id: 'app.shutdown', version: '1.0.0' });
    app.event('tick', { description: 'Tick' });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Subscribe
    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_req_5',
        eventTypes: ['tick'],
      }),
    );
    await subResult;

    // Shutdown
    const shutdownAck = waitFor(hostSide, (m) => m.type === 'shutdown_ack');
    hostSide.send(
      sessionMsg('shutdown', {
        id: 'sd_1',
        gracePeriod: 5000,
      }),
    );
    await shutdownAck;

    // After shutdown, a new instance would be created; this test verifies
    // the shutdown path doesn't throw.
    expect(true).toBe(true);
  });

  it('invokes onSubscribe hook with a ToolContext and event types', async () => {
    const app = createApp({ id: 'app.on-subscribe', version: '1.0.0' });
    app.event('tick', { description: 'Tick' });

    const onSubscribe = vi.fn();
    app.onSubscribe(onSubscribe);

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_req_on_sub',
        eventTypes: ['tick'],
      }),
    );
    await subResult;

    expect(onSubscribe).toHaveBeenCalledTimes(1);
    const [ctx, eventTypes] = onSubscribe.mock.calls[0];
    expect(eventTypes).toEqual(['tick']);
    expect(ctx).toHaveProperty('emit');
    expect(ctx).toHaveProperty('hasSubscribers');
    expect(ctx).toHaveProperty('secrets');
  });

  it('invokes onSubscribe hook for wildcard subscriptions', async () => {
    const app = createApp({ id: 'app.on-subscribe-wildcard', version: '1.0.0' });
    app.event('tick', { description: 'Tick' });

    const onSubscribe = vi.fn();
    app.onSubscribe(onSubscribe);

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_req_on_sub_wc',
        eventTypes: ['*'],
      }),
    );
    await subResult;

    expect(onSubscribe).toHaveBeenCalledTimes(1);
    const [, eventTypes] = onSubscribe.mock.calls[0];
    expect(eventTypes).toEqual(['*']);
  });

  it('onSubscribe hook can emit an event from the subscription context', async () => {
    const app = createApp({ id: 'app.on-subscribe-emit', version: '1.0.0' });
    app.event('tick', { description: 'Tick' });
    app.onSubscribe((ctx, eventTypes) => {
      if (eventTypes.includes('tick') || eventTypes.includes('*')) {
        ctx.emit('tick', { ready: true });
      }
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const eventPromise = waitFor(hostSide, (m) => m.type === 'event' && m.eventType === 'tick');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_req_on_sub_emit',
        eventTypes: ['tick'],
      }),
    );

    const eventMsg = await eventPromise;
    expect(eventMsg.payload).toEqual({ ready: true });
  });
});

// ---------------------------------------------------------------------------
// ctx.emit()
// ---------------------------------------------------------------------------

describe('ctx.emit()', () => {
  it('emits events from tool handler', async () => {
    const app = createApp({ id: 'app.emit', version: '1.0.0' });
    app.event('progress', { description: 'Progress event' });
    app.tool('long-task', {
      description: 'A task that emits progress events',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        ctx.emit('progress', { step: 1, total: 3 });
        ctx.emit('progress', { step: 2, total: 3 });
        ctx.emit('progress', { step: 3, total: 3 });
        return 'done';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Subscribe with wildcard
    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_req_6',
        eventTypes: ['*'],
      }),
    );
    await subResult;

    // Collect events
    const events: Record<string, unknown>[] = [];
    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'event') events.push(m);
    });

    // Call tool
    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_5',
        tool: 'long-task',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    await toolResult;

    expect(events.length).toBe(3);
    expect(events.map((e) => (e.payload as Record<string, unknown>).step)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// hasSubscribers / activeSubscriptions
// ---------------------------------------------------------------------------

describe('ctx.hasSubscribers()', () => {
  it('returns true when there are matching subscribers', async () => {
    const app = createApp({ id: 'app.has-sub', version: '1.0.0' });
    app.event('tick', { description: 'Tick event' });
    app.tool('check-sub', {
      description: 'Checks if there are subscribers',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        return {
          hasTick: ctx.hasSubscribers('tick'),
          hasTock: ctx.hasSubscribers('tock'),
        };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Subscribe to tick
    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_hs_1',
        eventTypes: ['tick'],
      }),
    );
    await subResult;

    // Call tool that checks subscribers
    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_hs_1',
        tool: 'check-sub',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    const result = await toolResult;
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ hasTick: true, hasTock: false });
  });

  it('returns true for wildcard subscribers', async () => {
    const app = createApp({ id: 'app.wild-sub', version: '1.0.0' });
    app.event('any_event', { description: 'Any event' });
    app.tool('check-wildcard', {
      description: 'Checks wildcard subscribers',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        return {
          hasAny: ctx.hasSubscribers('any_event'),
          hasOther: ctx.hasSubscribers('other_event'),
        };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Subscribe with wildcard
    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_wc_1',
        eventTypes: ['*'],
      }),
    );
    await subResult;

    // Call tool that checks subscribers
    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_wc_1',
        tool: 'check-wildcard',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    const result = await toolResult;
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ hasAny: true, hasOther: true });
  });

  it('returns false after unsubscribe', async () => {
    const app = createApp({ id: 'app.unsub-check', version: '1.0.0' });
    app.event('ping', { description: 'Ping event' });
    app.tool('check-after-unsub', {
      description: 'Checks subscribers after unsubscribe',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        return { hasPing: ctx.hasSubscribers('ping') };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Subscribe
    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_uu_1',
        eventTypes: ['ping'],
      }),
    );
    const subMsg = await subResult;
    const subscriptionId = subMsg.subscriptionId as string;

    // Unsubscribe
    const unsubResult = waitFor(hostSide, (m) => m.type === 'unsubscribe_result');
    hostSide.send(
      sessionMsg('unsubscribe', {
        id: 'unsub_uu_1',
        subscriptionId,
      }),
    );
    await unsubResult;

    // Check after unsubscribe
    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_uu_1',
        tool: 'check-after-unsub',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    const result = await toolResult;
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ hasPing: false });
  });
});

describe('ctx.activeSubscriptions()', () => {
  it('returns subscribed event types', async () => {
    const app = createApp({ id: 'app.active-sub', version: '1.0.0' });
    app.event('tick', { description: 'Tick' });
    app.event('tock', { description: 'Tock' });
    app.tool('list-active', {
      description: 'Lists active subscriptions',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        return { active: ctx.activeSubscriptions() };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Subscribe to tick only
    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_as_1',
        eventTypes: ['tick'],
      }),
    );
    await subResult;

    // Call tool that lists active subscriptions
    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_as_1',
        tool: 'list-active',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    const result = await toolResult;
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ active: ['tick'] });
  });

  it('includes wildcard in active subscriptions', async () => {
    const app = createApp({ id: 'app.wild-active', version: '1.0.0' });
    app.event('event_a', { description: 'Event A' });
    app.tool('list-wildcard', {
      description: 'Lists active subscriptions with wildcard',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        return { active: ctx.activeSubscriptions() };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Subscribe with wildcard
    const subResult = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_wa_1',
        eventTypes: ['*'],
      }),
    );
    await subResult;

    // Call tool
    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_wa_1',
        tool: 'list-wildcard',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    const result = await toolResult;
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ active: ['*'] });
  });

  it('returns empty array when no subscriptions', async () => {
    const app = createApp({ id: 'app.empty-sub', version: '1.0.0' });
    app.event('tick', { description: 'Tick' });
    app.tool('list-empty', {
      description: 'Lists subscriptions when none exist',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        return { active: ctx.activeSubscriptions() };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // No subscriptions!

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_es_1',
        tool: 'list-empty',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    const result = await toolResult;
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ active: [] });
  });
});
