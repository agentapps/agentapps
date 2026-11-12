/**
 * @agentapps/cli — file-backed station store tests.
 *
 * Verifies the PolicyStore / ApiKeyStore adapters over the CLI state files,
 * including the live-reload semantics (CLI writes are visible to the store
 * without a restart) and revoked/expired key filtering.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ApiKeyRecord, Policy } from '@agentapps/protocol';
import { hashApiKey } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadApiKeys, saveApiKeys, savePolicies } from '../src/state.js';
import { createLocalApiKeyStore, createLocalPolicyStore } from '../src/station-stores.js';

function makePolicy(principalId: string, defaultEffect: Policy['defaultEffect'] = 'deny'): Policy {
  const now = new Date().toISOString();
  return {
    principalId,
    approver: 'admin',
    defaultEffect,
    rules: [],
    createdAt: now,
    updatedAt: now,
  };
}

function makeKey(id: string, raw: string, extra?: Partial<ApiKeyRecord>): ApiKeyRecord {
  const now = new Date().toISOString();
  return {
    id,
    name: `key-${id}`,
    keyHash: hashApiKey(raw),
    prefix: raw.slice(0, 12),
    identity: { userId: 'user-1' },
    principalId: id,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

let tmpDir: string;
let configPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agentapps-station-stores-'));
  configPath = join(tmpDir, 'agentapps.json');
  writeFileSync(configPath, '{}');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('createLocalPolicyStore', () => {
  it('[POLICY-AC-2] keeps one Policy per Principal: puts, gets, lists and removes', async () => {
    const store = createLocalPolicyStore(configPath);

    await store.put(makePolicy('ak_a'));
    await store.put(makePolicy('ak_b'));
    expect((await store.list()).map((p) => p.principalId)).toEqual(['ak_a', 'ak_b']);

    expect((await store.get('ak_a'))?.defaultEffect).toBe('deny');
    expect(await store.get('ak_missing')).toBeNull();

    expect(await store.remove('ak_a')).toBe(true);
    expect(await store.remove('ak_a')).toBe(false);
    expect((await store.list()).map((p) => p.principalId)).toEqual(['ak_b']);
  });

  it("replaces the Principal's Policy on put", async () => {
    const store = createLocalPolicyStore(configPath);
    await store.put(makePolicy('ak_a'));
    await store.put(makePolicy('ak_a', 'allow'));

    expect(await store.list()).toHaveLength(1);
    expect((await store.get('ak_a'))?.defaultEffect).toBe('allow');
  });

  it('sees policies written directly to the state file (live reload)', async () => {
    const store = createLocalPolicyStore(configPath);
    expect(await store.list()).toHaveLength(0);

    savePolicies(configPath, [makePolicy('ak_cli')]);
    expect((await store.get('ak_cli'))?.principalId).toBe('ak_cli');
  });
});

describe('createLocalApiKeyStore', () => {
  it('creates keys and looks them up by hash', async () => {
    const store = createLocalApiKeyStore(configPath);
    await store.create(makeKey('ak_1', 'aak_secret1'));

    const found = await store.getByHash(hashApiKey('aak_secret1'));
    expect(found?.id).toBe('ak_1');
    expect(await store.getByHash(hashApiKey('aak_wrong'))).toBeNull();
  });

  it('getByHash skips revoked and expired keys', async () => {
    const store = createLocalApiKeyStore(configPath);
    await store.create(
      makeKey('ak_revoked', 'aak_revoked1', { revokedAt: new Date().toISOString() }),
    );
    await store.create(
      makeKey('ak_expired', 'aak_expired1', {
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    );

    expect(await store.getByHash(hashApiKey('aak_revoked1'))).toBeNull();
    expect(await store.getByHash(hashApiKey('aak_expired1'))).toBeNull();
  });

  it('list strips the key hash and filters by userId', async () => {
    const store = createLocalApiKeyStore(configPath);
    await store.create(makeKey('ak_1', 'aak_secret1'));
    await store.create(makeKey('ak_2', 'aak_secret2', { identity: { userId: 'user-2' } }));

    const all = await store.list();
    expect(all).toHaveLength(2);
    for (const record of all) {
      expect(record.keyHash).toBeUndefined();
    }

    const filtered = await store.list({ userId: 'user-2' });
    expect(filtered.map((k) => k.id)).toEqual(['ak_2']);
  });

  it('revoke persists to the state file', async () => {
    const store = createLocalApiKeyStore(configPath);
    await store.create(makeKey('ak_1', 'aak_secret1'));

    expect(await store.revoke('ak_1')).toBe(true);
    expect(await store.revoke('ak_missing')).toBe(false);

    const onDisk = loadApiKeys(configPath);
    expect(onDisk[0].revokedAt).toBeTruthy();
    expect(await store.getByHash(hashApiKey('aak_secret1'))).toBeNull();
  });

  it('sees keys revoked directly through the state file (live reload)', async () => {
    const store = createLocalApiKeyStore(configPath);
    await store.create(makeKey('ak_1', 'aak_secret1'));
    expect(await store.getByHash(hashApiKey('aak_secret1'))).not.toBeNull();

    const keys = loadApiKeys(configPath);
    keys[0].revokedAt = new Date().toISOString();
    saveApiKeys(configPath, keys);

    expect(await store.getByHash(hashApiKey('aak_secret1'))).toBeNull();
  });
});
