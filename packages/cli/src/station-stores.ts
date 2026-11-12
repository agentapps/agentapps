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
import type { ApiKeyRecord, Policy } from '@agentapps/protocol';
import type { ApiKeyStore, PolicyStore } from '@agentapps/station';
import { loadApiKeys, loadPolicies, saveApiKeys, savePolicies } from './state.js';

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
