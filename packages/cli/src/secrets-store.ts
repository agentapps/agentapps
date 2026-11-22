/**
 * @agentapps/cli — local system-secrets store for apps.
 *
 * Stores app-level system secrets in `.secrets/apps/<appId>.json` inside the
 * workspace. These are distinct from per-installation secrets and are shared
 * across all installations of the same app.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

/**
 * Write a file that holds secrets so that only its owner can read it, also
 * when the file already existed with wider permissions.
 *
 * @spec CLI-REQ-13
 */
export function writeSecretFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
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
  writeSecretFile(appSecretsPath(configPath, appId), next);
}

/** List all app IDs that have stored system secrets. */
export function listAppsWithSecrets(configPath: string): string[] {
  const dir = appSecretsDir(configPath);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5));
}

// ── Client keys ───────────────────────────────────────────────────────────
// The raw API key an agent client (Claude Code, …) uses, kept here so the
// client's own settings only name it (CLI-REQ-5).

const CLIENTS_SECRETS_DIR = 'clients';

export interface ClientKey {
  /** The API key record's id (`ak_…`), which is also its Principal. */
  keyId: string;
  /** The raw `aak_…` value. */
  key: string;
}

function clientKeyPath(configPath: string, name: string): string {
  return resolve(dirname(resolve(configPath)), SECRETS_DIR, CLIENTS_SECRETS_DIR, `${name}.json`);
}

/** @spec CLI-REQ-5 */
export function loadClientKey(configPath: string, name: string): ClientKey | undefined {
  const path = clientKeyPath(configPath, name);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ClientKey>;
    return typeof parsed.keyId === 'string' && typeof parsed.key === 'string'
      ? { keyId: parsed.keyId, key: parsed.key }
      : undefined;
  } catch {
    return undefined;
  }
}

/** @spec CLI-REQ-5 */
export function saveClientKey(configPath: string, name: string, value: ClientKey): void {
  const path = clientKeyPath(configPath, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

/** @spec CLI-REQ-5 */
export function deleteClientKey(configPath: string, name: string): void {
  rmSync(clientKeyPath(configPath, name), { force: true });
}
