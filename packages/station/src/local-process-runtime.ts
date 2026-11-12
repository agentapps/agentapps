/**
 * LocalProcessRuntime — runtime adapter that spawns apps as child processes
 * communicating via stdio (MCP JSON-lines framing).
 *
 * Each spawn() creates a new node child process, wires a StdioTransport
 * across stdin/stdout, and returns an InstanceHandle for lifecycle management.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import {
  createEnvelope,
  type MessageBase,
  StdioTransport,
  type Unsubscribe,
} from '@agentapps/protocol';
import type { InstanceHandle, RuntimeAdapter, SpawnConfig } from './types.js';

export interface LocalProcessRuntimeOptions {
  /** Path to the app entry file (e.g., './dist/app.js'). */
  entryPoint: string;
  /** Node executable path (default: 'node'). */
  nodePath?: string;
  /** Additional environment variables for the child process. */
  env?: Record<string, string>;
}

export class LocalProcessRuntime implements RuntimeAdapter {
  private counter = 0;
  private instances = new Map<
    string,
    {
      child: ChildProcess;
      transport: StdioTransport;
      onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
    }
  >();

  constructor(private readonly options: LocalProcessRuntimeOptions) {}

  async spawn(config: SpawnConfig): Promise<InstanceHandle> {
    this.counter++;
    const instanceId = `localproc_${config.installationId}_${this.counter}`;

    const nodePath = this.options.nodePath ?? 'node';
    const child = spawn(nodePath, [this.options.entryPoint], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...this.options.env,
        // VOL-REQ-5: mount mode reaches a child process through its environment.
        ...(config.volumePath ? { AGENTAPPS_VOLUME_PATH: config.volumePath } : {}),
      },
    });

    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new Error(
        `Failed to spawn child process: stdio pipes not available for ${this.options.entryPoint}`,
      );
    }

    // Redirect stderr to logs
    child.stderr.on('data', (data: Buffer) => {
      const lines = data.toString('utf-8').trim().split('\n');
      for (const line of lines) {
        if (line) {
          // eslint-disable-next-line no-console
          console.error(`[${instanceId}] ${line}`);
        }
      }
    });

    // Create transport with crossed streams:
    // app station writes to child.stdin, reads from child.stdout
    const transport = new StdioTransport({
      stdin: child.stdout,
      stdout: child.stdin,
    });

    // Track instance for cleanup
    const instanceState = {
      child,
      transport,
      onExit: (_code: number | null, _signal: NodeJS.Signals | null) => {},
    };
    this.instances.set(instanceId, instanceState);

    // Crash detection
    child.on('exit', (code, signal) => {
      instanceState.onExit(code, signal);
      this.instances.delete(instanceId);
    });

    return {
      instanceId,
      send(msg: MessageBase) {
        transport.send(msg);
      },
      onMessage(handler: (msg: MessageBase) => void): Unsubscribe {
        return transport.onMessage(handler);
      },
      isAlive() {
        return child.exitCode === null && child.signalCode === null;
      },
      async stop(gracePeriodMs: number) {
        // 1. Send shutdown message (graceful protocol-level shutdown)
        if (child.exitCode === null && child.signalCode === null) {
          try {
            transport.send({
              ...createEnvelope('shutdown'),
              id: `shutdown_${instanceId}`,
              sessionId: config.installationId,
            });
          } catch {
            // Transport may already be closed; proceed to signals
          }

          // 2. Wait grace period for the child to exit voluntarily
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              child.off('exit', onExit);
              resolve();
            }, gracePeriodMs);

            const onExit = () => {
              clearTimeout(timer);
              resolve();
            };

            child.once('exit', onExit);
          });
        }

        // 3. SIGTERM if still alive
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGTERM');

          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              child.off('exit', onExit);
              resolve();
            }, 5_000);

            const onExit = () => {
              clearTimeout(timer);
              resolve();
            };

            child.once('exit', onExit);
          });
        }

        // 4. SIGKILL if still alive
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }

        // 5. Clean up transport
        await transport.close();
      },
    };
  }

  /** Get the number of tracked instances. */
  get instanceCount(): number {
    return this.instances.size;
  }

  /** Set a request for when a child process exits (for crash detection). */
  onExit(
    instanceId: string,
    request: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): void {
    const state = this.instances.get(instanceId);
    if (state) {
      state.onExit = request;
    }
  }
}
