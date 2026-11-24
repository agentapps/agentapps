/**
 * The Station the CLI starts is for this machine unless told otherwise (CLI-REQ-12).
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  InMemoryApiKeyStore,
  InMemoryDataStore,
  InMemorySecretStore,
  StationServer,
} from '@agentapps/station';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(here, '..', 'src', 'bin.ts');
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;

/** An address of this machine that is not loopback, when it has a network. */
const LAN = Object.values(networkInterfaces())
  .flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const { port } = probe.address() as { port: number };
  await new Promise((r) => probe.close(r));
  return port;
}

const status = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(5000) }).then(
    (r) => r.status,
    () => 'refused' as const,
  );

describe.skipIf(!LAN)('a Station with no key', () => {
  it('[CLI-AC-12] started by the CLI, listens on this machine only', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agentapps-loopback-'));
    const port = await freePort();
    const station = spawn(
      process.execPath,
      ['--import', TSX, BIN, 'serve', String(port), '--foreground'],
      { cwd: home, env: { ...process.env, NODE_PATH: '', HOME: home, NO_COLOR: '1' } },
    );
    try {
      await new Promise<void>((done, fail) => {
        let out = '';
        const seen = (c: Buffer) => {
          out += c.toString();
          if (out.includes('server ready')) done();
        };
        station.stdout.on('data', seen);
        station.stderr.on('data', seen);
        station.on('close', () => fail(new Error(out)));
      });
      expect(await status(`http://127.0.0.1:${port}/approvals`)).toBe(200);
      expect(await status(`http://${LAN}:${port}/approvals`)).toBe('refused');
    } finally {
      station.kill();
      rmSync(home, { recursive: true, force: true });
    }
  }, 120_000);

  it('[CLI-AC-12] listening everywhere, serves only this machine without a credential', async () => {
    const server = new StationServer({
      stationId: 'stn_test',
      workspaceId: 'ws_test',
      secretStore: new InMemorySecretStore(),
      dataStore: new InMemoryDataStore(),
      publicUrl: 'http://station.test',
      apps: [],
      host: '0.0.0.0',
      openToLoopbackOnly: true,
      apiKeys: new InMemoryApiKeyStore(),
    });
    const { port } = await server.start(0);
    // A protocol message with no credential: answered for this machine, refused for the rest.
    const post = (host: string) =>
      fetch(`http://${host}:${port}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(5000),
      }).then((r) => r.status);
    try {
      expect(await post('127.0.0.1')).not.toBe(401);
      expect(await post(LAN as string)).toBe(401);
    } finally {
      await server.stop();
    }
  });
});
