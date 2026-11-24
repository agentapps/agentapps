/**
 * For tests that run the real `agentapps` command: a workspace config whose
 * Station and CLI agree on a free port.
 */

import { createServer } from 'node:net';

export async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const { port } = probe.address() as { port: number };
  await new Promise((r) => probe.close(r));
  return port;
}

/** The settings a workspace config needs for `station start` and for every command after it. */
export function stationSettings(port: number): Record<string, unknown> {
  return {
    station: {
      id: 'stn_test',
      host: '127.0.0.1',
      port,
      publicUrl: `http://localhost:${port}`,
    },
    cli: { stationUrl: `http://localhost:${port}` },
    workspace: { id: 'ws_test' },
  };
}
