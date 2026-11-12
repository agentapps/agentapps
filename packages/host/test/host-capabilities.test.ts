/**
 * Acceptance tests for Host Capabilities (docs/specs/host-capabilities.md).
 */

import { fileURLToPath } from 'node:url';
import {
  createEnvelope,
  createInProcessTransportPair,
  type HostCapabilities,
  type MessageBase,
  PROTOCOL_VERSION,
} from '@agentapps/protocol';
import { createApp, HostUnsupportedError } from '@agentapps/sdk';
import {
  AppStation,
  InProcessRuntime,
  LocalProcessRuntime,
  type RuntimeAdapter,
} from '@agentapps/station';
import { describe, expect, it } from 'vitest';
import { AgentAppHost } from '../src/index.js';

const FULL: Omit<HostCapabilities, 'directConnection'> = {
  ui: { components: ['text', 'table'], appComponents: false, screens: true },
  multiUser: false,
  push: true,
  prompts: ['auth', 'url'],
  storage: true,
  objects: false,
  volume: true,
  profile: true,
  intents: false,
  hooks: { points: ['pre-turn'], supports: { transform: false } },
};

function hostEchoApp() {
  const app = createApp({ id: 'app.host-echo', version: '1.0.0' });
  app.tool('host', {
    description: 'Return the Host behind the session',
    parameters: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    handler: async (_args, ctx) => ({ host: ctx.host ?? null }),
  });
  app.tool('put', {
    description: 'Upload an object',
    parameters: { type: 'object', properties: {} },
    annotations: { readOnlyHint: false },
    handler: async (_args, ctx) => {
      try {
        await ctx.objects.put('hello', { contentType: 'text/plain' });
        return { outcome: 'stored' };
      } catch (err) {
        return {
          outcome: err instanceof HostUnsupportedError ? 'unsupported' : 'other',
          message: (err as Error).message,
        };
      }
    },
  });
  return app;
}

async function connect(runtime: RuntimeAdapter, capabilities: typeof FULL) {
  const station = new AppStation({ appId: 'app.host-echo', appVersion: '1.0.0', runtime });
  const [hostSide, stationSide] = createInProcessTransportPair();
  station.accept(stationSide);
  const host = new AgentAppHost(hostSide, {
    host: { name: 'cap-test-host', version: '9.9.9' },
    capabilities,
  });
  await host.initialize();
  const session = await host.openSession({ installationId: 'ins_cap', tenant: { userId: 'u' } });
  return {
    session,
    async close() {
      await host.shutdown();
      await station.shutdown();
    },
  };
}

describe('Host Capabilities', () => {
  it('[HOSTCAP-AC-2] ctx.host holds what the Host declared, in-process and over stdio', {
    timeout: 30_000,
  }, async () => {
    const expected = { name: 'cap-test-host', version: '9.9.9', capabilities: FULL };
    const inProcess = await connect(new InProcessRuntime(hostEchoApp().toFactory()), FULL);
    const a = await inProcess.session.callTool(
      'host',
      {},
      { userId: 'u', installationId: 'ins_cap' },
    );
    expect((a.result as { host: unknown }).host).toEqual(expected);
    await inProcess.close();

    const fixture = fileURLToPath(new URL('./fixtures/host-echo-app.mjs', import.meta.url));
    const stdio = await connect(new LocalProcessRuntime({ entryPoint: fixture }), FULL);
    const b = await stdio.session.callTool('host', {}, { userId: 'u', installationId: 'ins_cap' });
    expect((b.result as { host: unknown }).host).toEqual(expected);
    await stdio.close();
  });

  it('[HOSTCAP-AC-3] a Request for an undeclared feature raises HostUnsupportedError', async () => {
    const conn = await connect(new InProcessRuntime(hostEchoApp().toFactory()), FULL);
    const result = await conn.session.callTool(
      'put',
      {},
      { userId: 'u', installationId: 'ins_cap' },
    );
    expect(result.result).toMatchObject({ outcome: 'unsupported' });
    await conn.close();
  });

  it('[HOSTCAP-AC-5] an initialize with only directConnection yields empty capabilities', async () => {
    const station = new AppStation({
      appId: 'app.host-echo',
      appVersion: '1.0.0',
      runtime: new InProcessRuntime(hostEchoApp().toFactory()),
    });
    const [host, stationSide] = createInProcessTransportPair();
    station.accept(stationSide);
    const received: Record<string, unknown>[] = [];
    host.onMessage((m) => received.push(m as Record<string, unknown>));
    const waitFor = async (type: string) => {
      for (let i = 0; i < 400; i++) {
        const found = received.find((m) => m.type === type);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error(`timeout waiting for ${type}`);
    };
    host.send({
      ...createEnvelope('initialize'),
      supportedVersions: [PROTOCOL_VERSION],
      host: { name: 'old-host', version: '0.1.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitFor('initialized');
    host.send({
      ...createEnvelope('session_open'),
      installationId: 'ins_old',
      tenant: { userId: 'u' },
    } as MessageBase);
    const opened = await waitFor('session_opened');
    expect(opened.host).toEqual({ name: 'old-host', version: '0.1.0', capabilities: {} });
    await station.shutdown();
  });
});
