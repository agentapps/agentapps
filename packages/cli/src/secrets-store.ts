/**
 * @agentapps/cli — local system-secrets store for apps.
 *
 * Stores app-level system secrets in `.secrets/apps/<appId>.json` inside the
 * workspace. These are distinct from per-installation secrets and are shared
 * across all installations of the same app.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SECRETS_DIR = '.secrets';
const APPS_SECRETS_DIR = 'apps';

/** Resolve the directory that holds app system secrets. */
export function appSecretsDir(configPath: string): string {
  return resolve(dirname(resolve(configPath)), SECRETS_DIR, APPS_SECRETS_DIR);
}

/** Resolve the path for a given app's system secrets file. */
export function appSecretsPath(configPath: string, appId: string): string {
  return resolve(appSecretsDir(configPath), `${appId}.json`);
}

/** Load system secrets for an app. Returns an empty record if none exist. */
export function loadAppSecrets(configPath: string, appId: string): Record<string, string> {
  const path = appSecretsPath(configPath, appId);
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

/** Save system secrets for an app, merging with existing values. */
export function saveAppSecrets(
  configPath: string,
  appId: string,
  secrets: Record<string, string>,
): void {
  const dir = appSecretsDir(configPath);
  mkdirSync(dir, { recursive: true });
  const current = loadAppSecrets(configPath, appId);
  const next = { ...current, ...secrets };
  const path = appSecretsPath(configPath, appId);
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

/** List all app IDs that have stored system secrets. */
export function listAppsWithSecrets(configPath: string): string[] {
  const dir = appSecretsDir(configPath);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5));
}
