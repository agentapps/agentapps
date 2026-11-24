/**
 * The CLI and its Station keep a workspace's files in one place (CLI-REQ-14).
 */

import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalObjectsStore, ObjectStore } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspaceDataPath } from '../src/data-paths.js';
import { startWorkspace } from './support/workspace.js';

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

describe('workspace data', () => {
  it('[CLI-AC-14] a link to a private Object is served by the workspace’s Station, before and after a restart', async () => {
    const workspace = await startWorkspace({ dir });
    try {
      // Asking for any Object makes the Station create its link-signing secret,
      // in the workspace's Secret Store.
      await fetch(`${workspace.url}/objects/obj_${'0'.repeat(32)}`);
      const file = join(dir, '.agentapps', 'station-secret');
      const secret = readFileSync(file, 'utf8').trim();
      expect(secret.length).toBeGreaterThanOrEqual(32);
      if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);

      // An Object and a link as the Station makes them for an app, in the
      // workspace's data directory.
      expect(workspaceDataPath(configPath)).toBe(join(dir, '.agentapps', 'data'));
      const store = new ObjectStore({
        objects: new LocalObjectsStore(() => workspaceDataPath(configPath)),
        stationId: 'stn_test',
        stationSecret: secret,
        publicUrl: 'http://station.invalid',
      });
      const scope = { workspaceId: 'default', installationId: 'ins_1' };
      const meta = await store.put(scope, Buffer.from('hello'), {
        contentType: 'text/plain',
        visibility: 'private',
      });
      const link = await store.link(scope, meta.objectId, 600);
      const path = new URL(link?.url ?? '').pathname + new URL(link?.url ?? '').search;

      const served = await fetch(workspace.url + path);
      expect(served.status).toBe(200);
      expect(await served.text()).toBe('hello');
      expect((await fetch(`${workspace.url}/objects/${meta.objectId}`)).status).not.toBe(200);

      await workspace.restart();
      expect((await fetch(workspace.url + path)).status).toBe(200);
      expect(readFileSync(file, 'utf8').trim()).toBe(secret);
    } finally {
      await workspace.stop();
    }
  });
});
