/**
 * Test harness — spins up a app station + host in-process around a factory.
 */

import { AgentAppHost, type AgentAppHostConfig } from '@agentapps/host';
import {
  createInProcessTransportPair,
  type MessageBase,
  type Transport,
} from '@agentapps/protocol';
import { type AppFactory, AppStation, InProcessRuntime } from '@agentapps/station';

/** Options for creating a test harness. */
export interface TestHarnessOptions {
  /** App id used for the app station (default: 'app.test'). */
  appId?: string;
  /** App version used for the app station (default: '1.0.0'). */
  appVersion?: string;
  /** Host config forwarded to AgentAppHost (default: name='test-harness', version='1.0.0'). */
  hostConfig?: Partial<AgentAppHostConfig>;
  /** AppStation config overrides. */
  appStationConfig?: {
    openTimeoutMs?: number;
    maxInflightPerSession?: number;
    idleTimeoutMs?: number;
    maxInstances?: number;
  };
}

/** A running test harness with captured traffic and typed host access. */
export interface TestHarness {
  /** The host side (already initialized). */
  host: AgentAppHost;
  /** The app station instance. */
  appStation: AppStation;
  /** Every protocol message seen on the host transport (both directions). */
  traffic: MessageBase[];
  /** Clean up — shuts down host and app station. */
  shutdown(): Promise<void>;
}

/**
 * Create and initialize a test harness in one call.
 *
 * @example
 * ```ts
 * const harness = await createTestHarness(appFactory);
 * const session = await harness.host.openSession({ installationId: 'inst_1', tenant: { userId: 'u1' } });
 * const tools = await session.listTools();
 * await harness.shutdown();
 * ```
 */
export async function createTestHarness(
  appFactory: AppFactory,
  options: TestHarnessOptions = {},
): Promise<TestHarness> {
  const appId = options.appId ?? 'app.test';
  const appVersion = options.appVersion ?? '1.0.0';

  const runtime = new InProcessRuntime(appFactory);
  const appStation = new AppStation({
    appId,
    appVersion,
    runtime,
    ...options.appStationConfig,
  });

  const [hostSide, ctrlSide] = createInProcessTransportPair();

  const traffic: MessageBase[] = [];

  const wrapTransport = (t: Transport): Transport => ({
    send(msg: MessageBase) {
      traffic.push(msg);
      t.send(msg);
    },
    onMessage(handler) {
      return t.onMessage(handler);
    },
    close() {
      return t.close();
    },
  });

  const hostWrapped = wrapTransport(hostSide);
  const ctrlWrapped = wrapTransport(ctrlSide);

  appStation.accept(ctrlWrapped);

  const host = new AgentAppHost(hostWrapped, {
    host: { name: 'test-harness', version: '1.0.0' },
    // HOSTCAP-REQ-5: the harness declares every capability unless a test overrides it.
    capabilities: {
      ui: { components: true, appComponents: true, screens: true },
      multiUser: true,
      push: true,
      prompts: ['auth', 'secret', 'url'],
      storage: true,
      objects: true,
      volume: true,
      profile: true,
      intents: true,
      hooks: { points: [], supports: {} },
    },
    ...options.hostConfig,
  } as AgentAppHostConfig);

  await host.initialize();

  return {
    host,
    appStation,
    traffic,
    async shutdown() {
      await host.shutdown();
      await appStation.shutdown();
    },
  };
}
