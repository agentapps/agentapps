/**
 * A workspace on disk with its Station running in this process, the way
 * `serve` builds it, and a CLI context that points at it.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkspaceConfig } from '../../src/config.js';
import type { CliContext, GlobalOptions } from '../../src/types.js';
import { createWorkspaceStation, type WorkspaceStation } from '../../src/workspace-station.js';

export const ADMIN_TOKEN = 'admin-token-of-the-test-station';

export function options(extra: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    json: false,
    yaml: false,
    raw: false,
    manualCode: true,
    urlOnly: false,
    yes: false,
    verbose: false,
    help: false,
    ...extra,
  };
}

/** Write a loadable App into a directory: its Manifest and a module that exports a factory. */
export function writeApp(dir: string, manifest: Record<string, unknown>, module?: string): string {
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'agentapp.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dir, 'dist', 'app.js'), module ?? 'export default function factory() {}\n');
  return dir;
}

export interface TestWorkspace {
  dir: string;
  configPath: string;
  /** The URL the Station answers at. */
  url: string;
  station: WorkspaceStation;
  /** A fresh CLI context, read from the config as it is now. */
  ctx(): CliContext;
  /** Stop the Station and start it again on the same workspace. */
  restart(): Promise<void>;
  stop(): Promise<void>;
}

export interface TestWorkspaceOptions {
  /** App sources for `agentapps.json`, as paths or `npm:` sources. */
  sources?: string[];
  /** An existing directory to use; a new temporary one otherwise. */
  dir?: string;
  /** Extra top-level keys of `agentapps.json`. */
  config?: Record<string, unknown>;
}

/**
 * Create a workspace and start its Station. The config gets `cli.stationUrl`
 * and `.agentapps/station.json` the admin credential, as after `station start`.
 */
export async function startWorkspace(given: TestWorkspaceOptions = {}): Promise<TestWorkspace> {
  const dir = given.dir ?? mkdtempSync(join(tmpdir(), 'agentapps-workspace-'));
  const configPath = join(dir, 'agentapps.json');
  const base = {
    station: { id: 'stn_test', host: '127.0.0.1', port: 0, publicUrl: 'http://localhost:4100' },
    workspace: { id: 'ws_test' },
    apps: (given.sources ?? []).map((source) => ({ source })),
    ...given.config,
  };
  writeFileSync(configPath, `${JSON.stringify(base, null, 2)}\n`);

  let station!: WorkspaceStation;
  let url = '';
  const start = async (): Promise<void> => {
    station = await createWorkspaceStation(configPath, {
      port: 0,
      host: '127.0.0.1',
      publicUrl: 'http://localhost:4100',
      adminToken: ADMIN_TOKEN,
    });
    const info = await station.server.start(0, '127.0.0.1');
    url = info.url;
    // What `station start` leaves behind, and what `station use` writes.
    mkdirSync(join(dir, '.agentapps'), { recursive: true });
    writeFileSync(
      join(dir, '.agentapps', 'station.json'),
      JSON.stringify({
        pid: process.pid,
        port: info.port,
        url,
        startedAt: new Date().toISOString(),
        logPath: join(dir, '.agentapps', 'station.log'),
        adminToken: ADMIN_TOKEN,
      }),
    );
    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    raw.cli = { stationUrl: url };
    writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`);
  };
  await start();

  const workspace: TestWorkspace = {
    dir,
    configPath,
    get url() {
      return url;
    },
    get station() {
      return station;
    },
    ctx: () => ({ cwd: dir, config: loadWorkspaceConfig(configPath), configPath }),
    async restart() {
      await station.stop();
      await start();
    },
    async stop() {
      await station.stop();
      if (!given.dir) rmSync(dir, { recursive: true, force: true });
    },
  };
  return workspace;
}
