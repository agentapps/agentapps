/**
 * Tests for LocalProcessRuntime — child process runtime adapter.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
} from '@agentapps/protocol';
import { describe, expect, it } from 'vitest';
import { AppStation } from '../src/app-station.js';
import { LocalProcessRuntime } from '../src/local-process-runtime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures', 'echo-app.js');

/** Collect messages from a handle into an array. */
function collectMessages(handle: {
  onMessage(handler: (msg: MessageBase) => void): () => void;
}): MessageBase[] {
  const messages: MessageBase[] = [];
  handle.onMessage((msg) => messages.push(msg));
  return messages;
}

/** Wait for a message of the given type in the collected array. */
async function waitForMessage(
  messages: MessageBase[],
  type: string,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = messages.find((m) => m.type === type);
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`Timeout waiting for message type '${type}'`);
}

describe('LocalProcessRuntime', () => {
  it('spawns an app and proxies list_tools end-to-end', async () => {
    const runtime = new LocalProcessRuntime({
      entryPoint: fixturePath,
      nodePath: 'node',
    });

    const handle = await runtime.spawn({
      installationId: 'inst_echo_1',
      tenant: { userId: 'u_alice' },
    });

    expect(handle.instanceId).toMatch(/^localproc_inst_echo_1_\d+$/);
    expect(handle.isAlive()).toBe(true);

    const received = collectMessages(handle);

    const listToolsMsg = {
      ...createEnvelope('list_tools'),
      sessionId: 'sess_test_1',
    };
    handle.send(listToolsMsg);

    const toolsList = await waitForMessage(received, 'tools_list');
    expect(toolsList.id).toBe(listToolsMsg.id);
    expect(toolsList.sessionId).toBe('sess_test_1');

    const tools = toolsList.tools as Array<Record<string, unknown>>;
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('echo');

    await handle.stop(5_000);
  });

  it('proxies tool_call and returns tool_result', async () => {
    const runtime = new LocalProcessRuntime({
      entryPoint: fixturePath,
      nodePath: 'node',
    });

    const handle = await runtime.spawn({
      installationId: 'inst_echo_2',
      tenant: { userId: 'u_alice' },
    });

    const received = collectMessages(handle);

    const toolCallMsg = {
      ...createEnvelope('tool_call'),
      sessionId: 'sess_test_2',
      tool: 'echo',
      arguments: { greeting: 'hello from child' },
      context: { userId: 'u_alice', installationId: 'inst_echo_2' },
    };
    handle.send(toolCallMsg);

    const result = await waitForMessage(received, 'tool_result');
    expect(result.id).toBe(toolCallMsg.id);
    expect(result.sessionId).toBe('sess_test_2');
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ greeting: 'hello from child' });

    await handle.stop(5_000);
  });

  it('detects crash when child process is killed', async () => {
    const runtime = new LocalProcessRuntime({
      entryPoint: fixturePath,
      nodePath: 'node',
    });

    const handle = await runtime.spawn({
      installationId: 'inst_echo_crash',
      tenant: { userId: 'u_alice' },
    });

    expect(handle.isAlive()).toBe(true);

    // Kill the child process directly
    // @ts-expect-error — accessing internal child for test
    const child = runtime.instances.get(handle.instanceId)?.child;
    expect(child).toBeDefined();
    child.kill('SIGKILL');

    // Wait for the process to exit
    await new Promise((r) => setTimeout(r, 100));

    expect(handle.isAlive()).toBe(false);
  });

  it('stops gracefully with shutdown message, then SIGTERM, then SIGKILL', async () => {
    const runtime = new LocalProcessRuntime({
      entryPoint: fixturePath,
      nodePath: 'node',
    });

    const handle = await runtime.spawn({
      installationId: 'inst_echo_stop',
      tenant: { userId: 'u_alice' },
    });

    expect(handle.isAlive()).toBe(true);

    // Stop with short grace period — the echo-app handles shutdown and exits
    await handle.stop(500);

    expect(handle.isAlive()).toBe(false);
  });

  it('generates unique instanceIds per spawn', async () => {
    const runtime = new LocalProcessRuntime({
      entryPoint: fixturePath,
      nodePath: 'node',
    });

    const handle1 = await runtime.spawn({
      installationId: 'inst_multi',
      tenant: { userId: 'u_alice' },
    });
    const handle2 = await runtime.spawn({
      installationId: 'inst_multi',
      tenant: { userId: 'u_alice' },
    });

    expect(handle1.instanceId).not.toBe(handle2.instanceId);
    expect(handle1.isAlive()).toBe(true);
    expect(handle2.isAlive()).toBe(true);

    await handle1.stop(5_000);
    await handle2.stop(5_000);
  });

  it('tracks instance count', async () => {
    const runtime = new LocalProcessRuntime({
      entryPoint: fixturePath,
      nodePath: 'node',
    });

    expect(runtime.instanceCount).toBe(0);

    const handle = await runtime.spawn({
      installationId: 'inst_count',
      tenant: { userId: 'u_alice' },
    });

    expect(runtime.instanceCount).toBe(1);

    await handle.stop(5_000);

    // After child exits, the map entry is removed
    await new Promise((r) => setTimeout(r, 100));
    expect(runtime.instanceCount).toBe(0);
  });

  it('idle timeout — appStation closes session, child stops after idle timeout', async () => {
    const runtime = new LocalProcessRuntime({
      entryPoint: fixturePath,
      nodePath: 'node',
    });

    const appStation = new AppStation({
      appId: 'app.echo.local',
      appVersion: '1.0.0',
      runtime,
      idleTimeoutMs: 100,
    });

    const [hostTransport, controllerTransport] = createInProcessTransportPair();
    const received: MessageBase[] = [];
    hostTransport.onMessage((msg) => received.push(msg));
    appStation.accept(controllerTransport);

    // Initialize
    hostTransport.send({
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);

    await waitForMessage(received, 'initialized');

    // Open session
    hostTransport.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_idle',
      tenant: { userId: 'u_alice' },
    } as MessageBase);

    const opened = await waitForMessage(received, 'session_opened');
    const sessionId = opened.sessionId as string;

    // Close session
    hostTransport.send({
      ...createEnvelope('session_close'),
      sessionId,
    } as MessageBase);

    await waitForMessage(received, 'session_closed');

    // Wait for idle timeout to trigger instance teardown
    await new Promise((r) => setTimeout(r, 300));

    // The instance should have been stopped (idle_stopped) or crashed
    // Verify the app station has no live instances
    expect(appStation.instanceCount).toBe(0);

    await appStation.shutdown();
  });
});
