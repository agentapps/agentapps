/**
 * @agentapps/cli — file-backed station stores.
 *
 * Adapts the CLI's local state files (policies.json / api-keys.json) to the
 * station's PolicyStore / ApiKeyStore interfaces, so a station started with
 * `serve` enforces the same policies and keys the CLI commands manage.
 *
 * Files are re-read on every call: changes made through the CLI (`policy set`,
 * `key revoke`, ...) apply to a running station immediately, with no restart.
 */

import { timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ApiKeyRecord, Policy } from '@agentapps/protocol';
import type {
  ApiKeyStore,
  BindingStore,
  InstallationStore,
  PolicyStore,
  StationBinding,
  StationInstallation,
  WorkspaceStore,
} from '@agentapps/station';
import {
  ensureStateDir,
  loadApiKeys,
  loadBindings,
  loadInstallations,
  loadPolicies,
  saveApiKeys,
  saveBindings,
  saveInstallations,
  savePolicies,
  stateDir,
} from './state.js';

/** `policies.json` as the Station's PolicyStore: one Policy per Principal (POLICY-REQ-2). */
export function createLocalPolicyStore(configPath: string): PolicyStore {
  return {
    async put(policy: Policy): Promise<void> {
      const policies = loadPolicies(configPath).filter((p) => p.principalId !== policy.principalId);
      policies.push(policy);
      savePolicies(configPath, policies);
    },

    async get(principalId: string): Promise<Policy | null> {
      return loadPolicies(configPath).find((p) => p.principalId === principalId) ?? null;
    },

    async list(): Promise<Policy[]> {
      return loadPolicies(configPath);
    },

    async remove(principalId: string): Promise<boolean> {
      const policies = loadPolicies(configPath);
      const kept = policies.filter((p) => p.principalId !== principalId);
      if (kept.length === policies.length) return false;
      savePolicies(configPath, kept);
      return true;
    },
  };
}

export function createLocalApiKeyStore(configPath: string): ApiKeyStore {
  return {
    async create(record: ApiKeyRecord): Promise<void> {
      const keys = loadApiKeys(configPath);
      keys.push(record);
      saveApiKeys(configPath, keys);
    },

    async getByHash(keyHash: string): Promise<ApiKeyRecord | null> {
      const target = Buffer.from(keyHash, 'hex');
      const record = loadApiKeys(configPath).find((k) => {
        const stored = Buffer.from(k.keyHash, 'hex');
        return stored.length === target.length && timingSafeEqual(stored, target);
      });
      if (!record) return null;
      if (record.revokedAt) return null;
      if (record.expiresAt && new Date(record.expiresAt) <= new Date()) return null;
      return record;
    },

    async getById(id: string): Promise<ApiKeyRecord | null> {
      return loadApiKeys(configPath).find((k) => k.id === id) ?? null;
    },

    async list(filter?: { userId?: string }): Promise<ApiKeyRecord[]> {
      let records = loadApiKeys(configPath);
      if (filter?.userId) {
        records = records.filter((r) => r.identity.userId === filter.userId);
      }
      // Match the store contract: listings never expose the key hash.
      return records.map(({ keyHash: _, ...rest }) => rest as ApiKeyRecord);
    },

    async revoke(id: string): Promise<boolean> {
      const keys = loadApiKeys(configPath);
      const key = keys.find((k) => k.id === id);
      if (!key) return false;
      key.revokedAt = new Date().toISOString();
      saveApiKeys(configPath, keys);
      return true;
    },
  };
}

/**
 * `installations.json` as the Station's InstallationStore. Re-read on every
 * call, like the other stores here.
 *
 * @spec STADMIN-REQ-7
 */
export function createLocalInstallationStore(configPath: string): InstallationStore {
  return {
    list(): StationInstallation[] {
      return loadInstallations(configPath).map((i) => ({ ...i }));
    },
    create(installation: StationInstallation): void {
      const all = loadInstallations(configPath);
      all.push({
        installationId: installation.installationId,
        alias: installation.alias,
        appId: installation.appId,
        installedAt: installation.installedAt ?? new Date().toISOString(),
        ...(installation.workspaceId ? { workspaceId: installation.workspaceId } : {}),
        ...(installation.permissions ? { permissions: installation.permissions } : {}),
      });
      saveInstallations(configPath, all);
    },
    update(installationId, patch): boolean {
      const all = loadInstallations(configPath);
      const found = all.find((i) => i.installationId === installationId);
      if (!found) return false;
      if (patch.alias !== undefined) found.alias = patch.alias;
      if (patch.permissions !== undefined) found.permissions = patch.permissions;
      saveInstallations(configPath, all);
      return true;
    },
    remove(installationId): boolean {
      const all = loadInstallations(configPath);
      const kept = all.filter((i) => i.installationId !== installationId);
      if (kept.length === all.length) return false;
      saveInstallations(configPath, kept);
      return true;
    },
  };
}

/** `bindings.json` as the Station's BindingStore. @spec STADMIN-REQ-7 */
export function createLocalBindingStore(configPath: string): BindingStore {
  return {
    list: () => loadBindings(configPath),
    set(binding: StationBinding): void {
      const kept = loadBindings(configPath).filter(
        (b) =>
          !(b.installationId === binding.installationId && b.bindingName === binding.bindingName),
      );
      saveBindings(configPath, [...kept, binding]);
    },
    remove(installationId, bindingName): boolean {
      const all = loadBindings(configPath);
      const kept = all.filter(
        (b) => !(b.installationId === installationId && b.bindingName === bindingName),
      );
      if (kept.length === all.length) return false;
      saveBindings(configPath, kept);
      return true;
    },
    removeAllFor(installationId): void {
      saveBindings(
        configPath,
        loadBindings(configPath).filter(
          (b) => b.installationId !== installationId && b.targetInstallationId !== installationId,
        ),
      );
    },
  };
}

/**
 * The Workspaces a Station knows besides its home one, in `workspaces.json`.
 *
 * @spec STADMIN-REQ-11
 */
export function createLocalWorkspaceStore(configPath: string): WorkspaceStore {
  const path = resolve(stateDir(configPath), 'workspaces.json');
  const read = (): string[] => {
    if (!existsSync(path)) return [];
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === 'string') : [];
    } catch {
      return [];
    }
  };
  return {
    list: read,
    add(workspaceId: string): void {
      ensureStateDir(configPath);
      writeFileSync(path, `${JSON.stringify([...read(), workspaceId], null, 2)}\n`, 'utf8');
    },
  };
}
