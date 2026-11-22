/**
 * @agentapps/cli — where a workspace keeps its Volume and Objects, and the
 * secret that signs links to private Objects.
 *
 * The CLI and the Station it starts are separate processes that serve the same
 * workspace, so both read these from here.
 *
 * @spec CLI-REQ-14
 */

import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DATA_DIR = '.agentapps/data';
const SECRET_FILE = '.agentapps/station-secret';

/** Directory of the workspace's Volume and Objects. @spec CLI-REQ-14 */
export function workspaceDataPath(configPath: string): string {
  const env = process.env.AGENTAPPS_VOLUMES_BASE_PATH;
  if (env) return resolve(env);
  return resolve(dirname(resolve(configPath)), DATA_DIR);
}

/**
 * The secret that signs links to private Objects: `AGENTAPPS_STATION_SECRET`,
 * or one created once for the workspace and kept in a file only its owner reads.
 *
 * @spec CLI-REQ-14
 */
export function workspaceStationSecret(configPath: string): string {
  const env = process.env.AGENTAPPS_STATION_SECRET;
  if (env) return env;
  const path = resolve(dirname(resolve(configPath)), SECRET_FILE);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    try {
      // `wx`: when two processes get here at once, one creates it and both read it.
      writeFileSync(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  chmodSync(path, 0o600);
  return readFileSync(path, 'utf8').trim();
}
