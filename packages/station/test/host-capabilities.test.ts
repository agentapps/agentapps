/**
 * Station side of Host Capabilities (docs/specs/host-capabilities.md).
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
} from '@agentapps/protocol';
import { describe, expect, it } from 'vitest';
import { AppStation, InProcessRuntime } from '../src/index.js';

async function openTwoUsers(multiUser: boolean | undefined) {
  const station = new AppStation({
    appId: 'app.noop',
    appVersion: '1.0.0',
    runtime: new InProcessRuntime(() => {}),
  });
  const [host, stationSide] = createInProcessTransportPair();
  station.accept(stationSide);
  const received: Record<string, unknown>[] = [];
  host.onMessage((m) => received.push(m as Record<string, unknown>));
  const reply = async (id: string) => {
    for (let i = 0; i < 400; i++) {
      const found = received.find((m) => m.id === id);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`no reply to ${id}`);
  };
  const init = { ...createEnvelope('initialize') };
  host.send({
    ...init,
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'h', version: '1.0.0' },
    capabilities: { directConnection: false, ...(multiUser ? { multiUser } : {}) },
  } as MessageBase);
  await reply(init.id);
  const open = (userId: string, installationId: string) => {
    const env = createEnvelope('session_open');
    host.send({ ...env, installationId, tenant: { userId } } as MessageBase);
    return reply(env.id);
  };
  const pablo = await open('pablo', 'ins_a');
  const marianne = await open('marianne', 'ins_b');
  await station.shutdown();
  return { pablo, marianne };
}

describe('Host Capabilities in the Station', () => {
  it('[HOSTCAP-AC-6] a single-user Host is bound to its first user; a multi-user Host is not', async () => {
    const single = await openTwoUsers(undefined);
    expect(single.pablo.type).toBe('session_opened');
    expect(single.marianne.type).toBe('error');
    expect((single.marianne.error as { code: string }).code).toBe('NOT_SUPPORTED');

    const multi = await openTwoUsers(true);
    expect(multi.pablo.type).toBe('session_opened');
    expect(multi.marianne.type).toBe('session_opened');
  });
});
