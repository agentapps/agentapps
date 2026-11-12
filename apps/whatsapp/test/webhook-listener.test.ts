/**
 * Tests for the WAHA webhook listener: payload mapping and delivery to
 * subscribed sessions over a real local HTTP server.
 */

import type { ToolContext } from '@agentapps/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deliver,
  mapWahaEvent,
  startWebhookListener,
  stopWebhookListener,
  WEBHOOK_PATH,
} from '../src/lib/webhook-listener.js';

function fakeContext(
  listening: string[] = ['*'],
): ToolContext & { emit: ReturnType<typeof vi.fn> } {
  return {
    emit: vi.fn(),
    log: vi.fn(),
    hasSubscribers: (event: string) => listening.includes('*') || listening.includes(event),
  } as unknown as ToolContext & { emit: ReturnType<typeof vi.fn> };
}

afterEach(async () => {
  await stopWebhookListener();
});

describe('mapWahaEvent', () => {
  it('maps an incoming message to message_received', () => {
    const mapped = mapWahaEvent({
      event: 'message',
      payload: {
        id: 'm1',
        from: '34600000000@c.us',
        to: 'me@c.us',
        body: 'hola',
        timestamp: 1,
        type: 'chat',
        _data: { pushName: 'Ana' },
      },
    });
    expect(mapped?.event).toBe('message_received');
    expect(mapped?.data).toMatchObject({
      id: 'm1',
      body: 'hola',
      hasMedia: false,
      pushName: 'Ana',
    });
  });

  it('maps message.any to message_sent only when fromMe', () => {
    expect(mapWahaEvent({ event: 'message.any', payload: { id: 'm2', fromMe: false } })).toBeNull();
    const sent = mapWahaEvent({
      event: 'message.any',
      payload: { id: 'm2', fromMe: true, to: 'x' },
    });
    expect(sent?.event).toBe('message_sent');
    expect(sent?.data).toMatchObject({ id: 'm2', to: 'x' });
  });

  it('maps reactions and session status', () => {
    expect(mapWahaEvent({ event: 'message.reaction', payload: { id: 'm3', body: '👍' } })).toEqual({
      event: 'message_reaction',
      data: { id: 'm3', from: undefined, to: undefined, reaction: '👍', timestamp: undefined },
    });
    expect(mapWahaEvent({ event: 'session.status', payload: { status: 'WORKING' } })).toEqual({
      event: 'session_status',
      data: { session: 'default', status: 'WORKING' },
    });
  });

  it('ignores event types the app does not surface', () => {
    expect(mapWahaEvent({ event: 'presence.update', payload: {} })).toBeNull();
    expect(mapWahaEvent({})).toBeNull();
  });
});

describe('deliver', () => {
  it('emits only to sessions that listen to that event', async () => {
    const all = fakeContext(['*']);
    const onlyStatus = fakeContext(['session_status']);
    await startWebhookListener(all, 0);
    await startWebhookListener(onlyStatus, 0);

    const delivered = deliver({ event: 'message_received', data: { id: 'm1' } });

    expect(delivered).toBe(1);
    expect(all.emit).toHaveBeenCalledWith('message_received', { id: 'm1' });
    expect(onlyStatus.emit).not.toHaveBeenCalled();
  });
});

describe('startWebhookListener', () => {
  it('accepts WAHA POSTs on the webhook path and emits to subscribers', async () => {
    const ctx = fakeContext();
    const { port } = await startWebhookListener(ctx, 0);

    const res = await fetch(`http://127.0.0.1:${port}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'session.status',
        session: 's1',
        payload: { status: 'WORKING' },
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event: 'session.status', delivered: 1 });
    expect(ctx.emit).toHaveBeenCalledWith('session_status', { session: 's1', status: 'WORKING' });
  });

  it('is a singleton: a second subscriber reuses the running server', async () => {
    const first = await startWebhookListener(fakeContext(), 0);
    const second = await startWebhookListener(fakeContext(), 0);
    expect(second.port).toBe(first.port);
  });

  it('rejects other paths and malformed bodies', async () => {
    const { port } = await startWebhookListener(fakeContext(), 0);
    const notFound = await fetch(`http://127.0.0.1:${port}/other`, { method: 'POST', body: '{}' });
    expect(notFound.status).toBe(404);
    const bad = await fetch(`http://127.0.0.1:${port}${WEBHOOK_PATH}`, {
      method: 'POST',
      body: '{not json',
    });
    expect(bad.status).toBe(400);
  });
});
