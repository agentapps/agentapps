/**
 * Hook traffic through the Station (HOOK-REQ-25): in-process, stdio and HTTP.
 */

import { fileURLToPath } from 'node:url';
import { createEnvelope, createInProcessTransportPair, type HookHost } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';
import {
  AppStation,
  InMemoryDataStore,
  InMemorySecretStore,
  InProcessRuntime,
  LocalProcessRuntime,
  type RuntimeAdapter,
  StationServer,
} from '@agentapps/station';
import { describe, expect, it } from 'vitest';
import { AgentAppHost } from '../src/index.js';

const HOST: HookHost = {
  name: 'relay-test',
  supports: {
    transform: false,
    transformAttachments: false,
    history: false,
    preservedContext: false,
    onDream: false,
    conversationRead: false,
  },
};
const CONTEXT = { userId: 'u1', installationId: 'ins_relay' };
const PRE_TURN = {
  conversationId: 'c1',
  turnId: 't1',
  message: { text: 'hello', attachments: [] },
  now: '2026-11-09T10:00:00Z',
  history: [],
};
const POST_TURN = {
  conversationId: 'c1',
  turnId: 't1',
  message: { text: 'hello', attachments: [] },
  response: 'hi',
  toolCalls: [],
};

function relayApp() {
  const app = createApp({ id: 'app.hook-relay', version: '1.0.0' });
  app.hook('pre-turn', ({ input }) => ({
    context: [{ label: 'Echo', text: `seen: ${input.message.text}` }],
  }));
  app.hook('post-turn', () => {});
  return app;
}

async function roundTrip(runtime: RuntimeAdapter) {
  const station = new AppStation({ appId: 'app.hook-relay', appVersion: '1.0.0', runtime });
  const [hostSide, stationSide] = createInProcessTransportPair();
  station.accept(stationSide);
  const host = new AgentAppHost(hostSide, { host: { name: 'test', version: '1.0.0' } });
  try {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'ins_relay',
      tenant: { userId: 'u1' },
    });
    const shaped = await session.sendHook(
      'pre-turn',
      { context: CONTEXT, host: HOST, input: PRE_TURN },
      10_000,
    );
    const acked = await session.sendNotify(
      'post-turn',
      { key: 'c1:t1', context: CONTEXT, host: HOST, input: POST_TURN },
      10_000,
    );
    return { shaped, acked };
  } finally {
    await host.shutdown();
    await station.shutdown();
  }
}

const EXPECTED = { context: [{ label: 'Echo', text: 'seen: hello' }] };

describe('Hooks through the Station', () => {
  it('[HOOK-AC-28] shaping and notify round trips are unchanged in process and over stdio', async () => {
    const inProcess = await roundTrip(new InProcessRuntime(relayApp().toFactory()));
    expect(inProcess).toEqual({ shaped: EXPECTED, acked: true });

    const fixture = fileURLToPath(new URL('./fixtures/hook-app.mjs', import.meta.url));
    const stdio = await roundTrip(new LocalProcessRuntime({ entryPoint: fixture }));
    expect(stdio).toEqual({ shaped: EXPECTED, acked: true });
  }, 30_000);

  it('[HOOK-AC-28] shaping and notify round trips are unchanged over the HTTP Station', async () => {
    const server = new StationServer({
      stationId: 'stn_test',
      workspaceId: 'ws_test',
      secretStore: new InMemorySecretStore(),
      dataStore: new InMemoryDataStore(),
      publicUrl: 'http://station.test',
      apps: [{ id: 'app.hook-relay', version: '1.0.0', factory: relayApp().toFactory() }],
    });
    const { url } = await server.start(0, '127.0.0.1');
    try {
      const post = async (body: Record<string, unknown>) => {
        const res = await fetch(`${url}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return (await res.json()) as Record<string, unknown>;
      };
      const opened = await post({
        ...createEnvelope('session_open'),
        appId: 'app.hook-relay',
        installationId: 'ins_relay',
        tenant: { userId: 'u1' },
      });
      const sessionId = opened.sessionId as string;
      const shaped = await post({
        ...createEnvelope('hook_request'),
        sessionId,
        requestId: 'r1',
        hookPoint: 'pre-turn',
        context: CONTEXT,
        host: HOST,
        input: PRE_TURN,
      });
      expect(shaped).toMatchObject({ type: 'hook_response', requestId: 'r1', ...EXPECTED });
      const notify = createEnvelope('hook_notify');
      const ack = await post({
        ...notify,
        sessionId,
        notifyId: notify.id,
        hookPoint: 'post-turn',
        key: 'c1:t1',
        context: CONTEXT,
        host: HOST,
        input: POST_TURN,
      });
      expect(ack).toMatchObject({ type: 'hook_ack', notifyId: notify.id });
    } finally {
      await server.stop();
    }
  });
});
