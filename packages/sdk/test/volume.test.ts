/**
 * SDK side of the Workspace Volume spec (docs/specs/volume.md): the mount
 * path an Instance sees, and the API-mode calls the SDK sends.
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';

/** Open a session on an app whose tool returns ctx.volume.mountPath. */
async function mountPathSeenBy(volumePath: string | undefined): Promise<unknown> {
  const app = createApp({ id: 'app.mount-reader', version: '1.0.0' });
  app.tool('where', {
    description: 'Return the mount path the instance sees',
    parameters: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    handler: async (_args, ctx) => ({ mountPath: ctx.volume.mountPath ?? null }),
  });

  const station = new AppStation({
    appId: 'app.mount-reader',
    appVersion: '1.0.0',
    runtime: new InProcessRuntime(app.toFactory()),
    resolveMountPath: () => volumePath,
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
    host: { name: 'test', version: '1.0.0' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitFor('initialized');
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'ins_reader',
    tenant: { userId: 'u' },
  } as MessageBase);
  const opened = await waitFor('session_opened');
  host.send({
    ...createEnvelope('tool_call'),
    sessionId: opened.sessionId,
    tool: 'where',
    arguments: {},
    context: { userId: 'u', installationId: 'ins_reader' },
  } as MessageBase);
  const result = await waitFor('tool_result');
  await station.shutdown();
  return (result.result as { mountPath: unknown }).mountPath;
}

describe('ctx.volume', () => {
  it('[VOL-AC-5] mountPath is the mounted Volume for a mounting app and undefined otherwise', async () => {
    expect(await mountPathSeenBy('/volumes/ws_hexagon/workspace')).toBe(
      '/volumes/ws_hexagon/workspace',
    );
    expect(await mountPathSeenBy(undefined)).toBeNull();
  });
});
