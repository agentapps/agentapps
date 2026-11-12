/**
 * In-process runtime adapter.
 *
 * Instances run as message handlers in the same process — no child
 * processes, no containers. Used for dev mode, tests, and simple
 * standalone apps.
 */

import {
  createInProcessTransportPair,
  type MessageBase,
  type Transport,
  type Unsubscribe,
} from '@agentapps/protocol';
import type { InstanceHandle, RuntimeAdapter, SpawnConfig } from './types.js';

/**
 * App factory — sets up an app instance on the given transport.
 *
 * This is the contract `@agentapps/sdk`'s `createApp()` will implement:
 * the factory receives one end of a transport and registers tool handlers,
 * event emitters, etc. on it.
 *
 * For tests, a simple factory can be written inline:
 * ```ts
 * const echoFactory: AppFactory = (transport) => {
 *   transport.onMessage((msg) => {
 *     if (msg.type === 'list_tools') {
 *       transport.send({ ...envelope, type: 'tools_list', tools: [...] });
 *     }
 *   });
 * };
 * ```
 */
export type AppFactory = (
  transport: Transport,
  environment?: InstanceEnvironment,
) => void | Promise<void>;

/**
 * What the Station hands an in-process Instance at spawn. In a child process
 * the same values travel as environment variables.
 */
export interface InstanceEnvironment {
  /** Volume in mount mode; `AGENTAPPS_VOLUME_PATH` for child processes (VOL-REQ-5). */
  volumePath?: string;
}

/**
 * In-process runtime adapter. Each `spawn()` call runs the AppFactory
 * with a fresh in-process transport pair, so the app station communicates
 * with the "instance" via direct function calls.
 */
export class InProcessRuntime implements RuntimeAdapter {
  private counter = 0;
  private instances = new Map<
    string,
    { controllerSide: Transport; appSide: Transport; alive: boolean }
  >();

  constructor(private readonly factory: AppFactory) {}

  async spawn(config: SpawnConfig): Promise<InstanceHandle> {
    this.counter++;
    const instanceId = `inproc_${config.installationId}_${this.counter}`;
    const [controllerSide, appSide] = createInProcessTransportPair();

    // Run the factory — it registers its handlers on appSide
    await this.factory(appSide, { volumePath: config.volumePath });

    const state = { controllerSide, appSide, alive: true };
    this.instances.set(instanceId, state);

    const self = this;
    return {
      instanceId,
      send(msg: MessageBase) {
        controllerSide.send(msg);
      },
      onMessage(handler: (msg: MessageBase) => void): Unsubscribe {
        return controllerSide.onMessage(handler);
      },
      async stop(_gracePeriodMs: number) {
        state.alive = false;
        self.instances.delete(instanceId);
        await controllerSide.close();
        await appSide.close();
      },
      isAlive() {
        return state.alive;
      },
    };
  }
}
