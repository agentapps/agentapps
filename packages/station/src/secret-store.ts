/**
 * Secret Store — where every secret lives, apart from the Station's own state
 * and from app data.
 *
 * Three kinds, each tied to the Station it belongs to:
 * - system secrets of an App (an OAuth client id), per Station and App;
 * - secrets of an Installation (its tokens), per Station, Workspace and Installation;
 * - the secret a Station signs Object links with, per Station.
 *
 * Only the Station talks to a Secret Store. Two implementations ship here:
 * `InMemorySecretStore` for tests and `LocalSecretStore`, a directory of files
 * only their owner can read.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** A system secret belongs to one App on one Station. */
export interface SystemSecretScope {
  stationId: string;
  appId: string;
}

/** An Installation's secrets belong to one Installation of one Workspace on one Station. */
export interface InstallationSecretScope {
  stationId: string;
  workspaceId: string;
  installationId: string;
}

/** The link-signing secret belongs to one Station. */
export interface StationSecretScope {
  stationId: string;
}

/**
 * The Secret Store contract: for each kind, read, set and remove.
 *
 * `set` merges the given keys into what is stored; `remove` deletes the named
 * keys and answers which of them were stored. Reading what was never set
 * answers an empty record, or `null` for the link-signing secret.
 *
 * It keeps secrets and nothing else: no documents, Objects, Volume files,
 * Installations, API Keys or Policies.
 *
 * @spec SECRETSTORE-REQ-1
 * @spec SECRETSTORE-REQ-2
 * @spec SECRETSTORE-REQ-3
 */
export interface SecretStore {
  getSystemSecrets(scope: SystemSecretScope): Promise<Record<string, string>>;
  setSystemSecrets(scope: SystemSecretScope, secrets: Record<string, string>): Promise<void>;
  removeSystemSecrets(scope: SystemSecretScope, keys: string[]): Promise<string[]>;

  getInstallationSecrets(scope: InstallationSecretScope): Promise<Record<string, string>>;
  setInstallationSecrets(
    scope: InstallationSecretScope,
    secrets: Record<string, string>,
  ): Promise<void>;
  removeInstallationSecrets(scope: InstallationSecretScope, keys: string[]): Promise<string[]>;

  getLinkSigningSecret(scope: StationSecretScope): Promise<string | null>;
  setLinkSigningSecret(scope: StationSecretScope, secret: string): Promise<void>;
  removeLinkSigningSecret(scope: StationSecretScope): Promise<boolean>;
}

function withoutKeys(
  current: Record<string, string>,
  keys: string[],
): { next: Record<string, string>; removed: string[] } {
  const next = { ...current };
  const removed: string[] = [];
  for (const key of keys) {
    if (Object.hasOwn(next, key)) {
      delete next[key];
      removed.push(key);
    }
  }
  return { next, removed };
}

/**
 * A Secret Store that keeps everything in process memory. For tests.
 *
 * @spec SECRETSTORE-NFR-2
 */
export class InMemorySecretStore implements SecretStore {
  private readonly records = new Map<string, Record<string, string>>();
  private readonly linkSecrets = new Map<string, string>();

  private static system(scope: SystemSecretScope): string {
    return JSON.stringify(['system', scope.stationId, scope.appId]);
  }

  private static installation(scope: InstallationSecretScope): string {
    return JSON.stringify([
      'installation',
      scope.stationId,
      scope.workspaceId,
      scope.installationId,
    ]);
  }

  private read(key: string): Record<string, string> {
    return { ...(this.records.get(key) ?? {}) };
  }

  private merge(key: string, secrets: Record<string, string>): void {
    this.records.set(key, { ...this.read(key), ...secrets });
  }

  private drop(key: string, keys: string[]): string[] {
    const { next, removed } = withoutKeys(this.read(key), keys);
    if (Object.keys(next).length === 0) this.records.delete(key);
    else this.records.set(key, next);
    return removed;
  }

  async getSystemSecrets(scope: SystemSecretScope): Promise<Record<string, string>> {
    return this.read(InMemorySecretStore.system(scope));
  }

  async setSystemSecrets(scope: SystemSecretScope, secrets: Record<string, string>): Promise<void> {
    this.merge(InMemorySecretStore.system(scope), secrets);
  }

  async removeSystemSecrets(scope: SystemSecretScope, keys: string[]): Promise<string[]> {
    return this.drop(InMemorySecretStore.system(scope), keys);
  }

  async getInstallationSecrets(scope: InstallationSecretScope): Promise<Record<string, string>> {
    return this.read(InMemorySecretStore.installation(scope));
  }

  async setInstallationSecrets(
    scope: InstallationSecretScope,
    secrets: Record<string, string>,
  ): Promise<void> {
    this.merge(InMemorySecretStore.installation(scope), secrets);
  }

  async removeInstallationSecrets(
    scope: InstallationSecretScope,
    keys: string[],
  ): Promise<string[]> {
    return this.drop(InMemorySecretStore.installation(scope), keys);
  }

  async getLinkSigningSecret(scope: StationSecretScope): Promise<string | null> {
    return this.linkSecrets.get(scope.stationId) ?? null;
  }

  async setLinkSigningSecret(scope: StationSecretScope, secret: string): Promise<void> {
    this.linkSecrets.set(scope.stationId, secret);
  }

  async removeLinkSigningSecret(scope: StationSecretScope): Promise<boolean> {
    return this.linkSecrets.delete(scope.stationId);
  }
}

/** Where a `LocalSecretStore` keeps the secrets of the Station it belongs to. */
export interface LocalSecretStoreOptions {
  /**
   * The Station this directory belongs to. Its secrets live at the paths
   * below, whatever its id; any other Station's go under `otherStationsDir`.
   */
  stationId: string;
  /** Directory of `<appId>.json` files: the system secrets. */
  systemSecretsDir: string;
  /** Directory of `<installationId>.json` files: the Installations' secrets. */
  installationSecretsDir: string;
  /** File holding the link-signing secret. */
  linkSigningSecretPath: string;
  /** Directory for the secrets of Stations other than `stationId`. */
  otherStationsDir: string;
}

/** A file or directory name made from an identifier, with nothing that could leave its folder. */
function safeName(id: string): string {
  if (id === '' || id === '.' || id === '..' || /[/\\\0]/.test(id)) {
    throw new Error(`Not usable as a name in the Secret Store: ${JSON.stringify(id)}`);
  }
  return id;
}

/**
 * A Secret Store that keeps everything in a directory, in files of mode `0600`.
 *
 * The directory belongs to one Station, so that Station's secrets need no id
 * in their paths: they are where a workspace has always kept them. The
 * Installation's file is named by its id alone, which is unique on a Station.
 *
 * @spec SECRETSTORE-REQ-8
 */
export class LocalSecretStore implements SecretStore {
  constructor(private readonly options: LocalSecretStoreOptions) {}

  private root(stationId: string): { system: string; installation: string; link: string } {
    if (stationId === this.options.stationId) {
      return {
        system: this.options.systemSecretsDir,
        installation: this.options.installationSecretsDir,
        link: this.options.linkSigningSecretPath,
      };
    }
    const base = join(this.options.otherStationsDir, safeName(stationId));
    return {
      system: join(base, 'apps'),
      installation: join(base, 'installation-secrets'),
      link: join(base, 'station-secret'),
    };
  }

  private systemPath(scope: SystemSecretScope): string {
    return join(this.root(scope.stationId).system, `${safeName(scope.appId)}.json`);
  }

  private installationPath(scope: InstallationSecretScope): string {
    return join(this.root(scope.stationId).installation, `${safeName(scope.installationId)}.json`);
  }

  private static read(path: string): Record<string, string> {
    if (!existsSync(path)) return {};
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') result[key] = value;
      }
      return result;
    } catch {
      return {};
    }
  }

  /** Writes the record with mode `0600`; an empty record removes the file. */
  private static write(path: string, value: Record<string, string>): void {
    if (Object.keys(value).length === 0) {
      rmSync(path, { force: true });
      return;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    chmodSync(path, 0o600);
  }

  private static merge(path: string, secrets: Record<string, string>): void {
    LocalSecretStore.write(path, { ...LocalSecretStore.read(path), ...secrets });
  }

  private static drop(path: string, keys: string[]): string[] {
    const { next, removed } = withoutKeys(LocalSecretStore.read(path), keys);
    if (removed.length > 0) LocalSecretStore.write(path, next);
    return removed;
  }

  async getSystemSecrets(scope: SystemSecretScope): Promise<Record<string, string>> {
    return LocalSecretStore.read(this.systemPath(scope));
  }

  async setSystemSecrets(scope: SystemSecretScope, secrets: Record<string, string>): Promise<void> {
    LocalSecretStore.merge(this.systemPath(scope), secrets);
  }

  async removeSystemSecrets(scope: SystemSecretScope, keys: string[]): Promise<string[]> {
    return LocalSecretStore.drop(this.systemPath(scope), keys);
  }

  async getInstallationSecrets(scope: InstallationSecretScope): Promise<Record<string, string>> {
    return LocalSecretStore.read(this.installationPath(scope));
  }

  async setInstallationSecrets(
    scope: InstallationSecretScope,
    secrets: Record<string, string>,
  ): Promise<void> {
    LocalSecretStore.merge(this.installationPath(scope), secrets);
  }

  async removeInstallationSecrets(
    scope: InstallationSecretScope,
    keys: string[],
  ): Promise<string[]> {
    return LocalSecretStore.drop(this.installationPath(scope), keys);
  }

  async getLinkSigningSecret(scope: StationSecretScope): Promise<string | null> {
    const path = this.root(scope.stationId).link;
    if (!existsSync(path)) return null;
    const secret = readFileSync(path, 'utf8').trim();
    return secret === '' ? null : secret;
  }

  async setLinkSigningSecret(scope: StationSecretScope, secret: string): Promise<void> {
    const path = this.root(scope.stationId).link;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, secret, { encoding: 'utf8', mode: 0o600 });
    chmodSync(path, 0o600);
  }

  async removeLinkSigningSecret(scope: StationSecretScope): Promise<boolean> {
    const path = this.root(scope.stationId).link;
    if (!existsSync(path)) return false;
    rmSync(path);
    return true;
  }
}
