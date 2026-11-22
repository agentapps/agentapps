/**
 * The CLI and its Station keep a workspace's files in one place (CLI-REQ-14).
 */

import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObjectStore, StationServer } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspaceDataPath, workspaceStationSecret } from '../src/data-paths.js';

let dir: string;
let configPath: string;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentapps-data-paths-'));
  configPath = join(dir, 'agentapps.json');
  writeFileSync(configPath, JSON.stringify({ apps: [] }));
  saved = {
    AGENTAPPS_VOLUMES_BASE_PATH: process.env.AGENTAPPS_VOLUMES_BASE_PATH,
    AGENTAPPS_STATION_SECRET: process.env.AGENTAPPS_STATION_SECRET,
  };
  delete process.env.AGENTAPPS_VOLUMES_BASE_PATH;
  delete process.env.AGENTAPPS_STATION_SECRET;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(dir, { recursive: true, force: true });
});

/** A Station as `station start` builds it, as far as Objects are concerned. */
async function station(): Promise<{ url: string; stop: () => Promise<void> }> {
  const server = new StationServer({
    apps: [],
    volumesBasePath: workspaceDataPath(configPath),
    stationSecret: workspaceStationSecret(configPath),
  });
  const { url } = await server.start(0, '127.0.0.1');
  return { url, stop: () => server.stop() };
}

describe('workspace data', () => {
  it('[CLI-AC-14] a link made by the CLI is served by its Station, before and after a restart', async () => {
    // What the CLI's Host does when an app stores a private Object and asks for a link.
    const store = new ObjectStore({
      volumesBasePath: workspaceDataPath(configPath),
      stationSecret: workspaceStationSecret(configPath),
      publicUrl: 'http://station.invalid',
    });
    const scope = { workspaceId: 'default', installationId: 'ins_1' };
    const meta = await store.put(scope, Buffer.from('hello'), {
      contentType: 'text/plain',
      visibility: 'private',
    });
    const link = await store.link(scope, meta.objectId, 600);
    const path = new URL(link?.url ?? '').pathname + new URL(link?.url ?? '').search;

    const first = await station();
    const served = await fetch(first.url + path);
    expect(served.status).toBe(200);
    expect(await served.text()).toBe('hello');
    expect((await fetch(`${first.url}/objects/${meta.objectId}`)).status).not.toBe(200);
    await first.stop();

    const second = await station();
    try {
      expect((await fetch(second.url + path)).status).toBe(200);
    } finally {
      await second.stop();
    }

    const file = join(dir, '.agentapps', 'station-secret');
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(workspaceStationSecret(configPath)).toBe(workspaceStationSecret(configPath));
    expect(workspaceDataPath(configPath)).toBe(join(dir, '.agentapps', 'data'));
  });
});
