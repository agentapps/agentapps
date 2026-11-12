/**
 * Agent App AppStation — runtime adapter and instance types.
 *
 * RuntimeAdapter is the abstraction that lets the Station spawn and
 * manage app instances without knowing whether they're in-process
 * functions or child processes.
 */

import type { MessageBase, Unsubscribe } from '@agentapps/protocol';

/** Handle to a running app instance. */
export interface InstanceHandle {
  /** Unique instance identifier. */
  readonly instanceId: string;

  /** Send a message to the instance. */
  send(message: MessageBase): void;

  /** Register handler for messages from the instance. Returns unsubscribe fn. */
  onMessage(handler: (message: MessageBase) => void): Unsubscribe;

  /** Stop the instance gracefully. */
  stop(gracePeriodMs: number): Promise<void>;

  /** Whether the instance is still alive. */
  isAlive(): boolean;
}

/** Configuration for spawning an instance. */
export interface SpawnConfig {
  installationId: string;
  tenant: { userId: string; workspaceId?: string };
  /**
   * Volume in mount mode: absolute path of the Workspace Volume to hand to
   * the Instance, set only for Apps that declare `runtime.mountVolume` and
   * hold the `volume` Permission (VOL-REQ-5).
   */
  volumePath?: string;
}

/**
 * Runtime adapter — how the Station spawns and manages app instances.
 *
 * Implementations:
 * - `InProcessRuntime` — instances are functions in the same process
 * - `LocalProcessRuntime` — child processes via stdio
 */
export interface RuntimeAdapter {
  /** Spawn a new instance. Returns a handle for communication. */
  spawn(config: SpawnConfig): Promise<InstanceHandle>;
}
