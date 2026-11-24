/**
 * @agentapps/cli — where a workspace keeps its Storage, its Volume and its
 * Objects. Read by the Station the workspace starts; the secret that signs
 * links to private Objects is in that Station's Secret Store.
 *
 * @spec CLI-REQ-14
 */

import { dirname, resolve } from 'node:path';

const DATA_DIR = '.agentapps/data';

/**
 * Directory of the workspace's Storage: one folder per Installation.
 *
 * @spec CLI-REQ-3
 */
export function workspaceStoragePath(configPath: string): string {
  return resolve(dirname(resolve(configPath)), DATA_DIR, 'storage');
}

/** Directory of the workspace's Volume and Objects. @spec CLI-REQ-14 */
export function workspaceDataPath(configPath: string): string {
  const env = process.env.AGENTAPPS_VOLUMES_BASE_PATH;
  if (env) return resolve(env);
  return resolve(dirname(resolve(configPath)), DATA_DIR);
}
