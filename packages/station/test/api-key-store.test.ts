/**
 * ApiKeyStore tests.
 *
 * Tests the InMemoryApiKeyStore (and by extension the ApiKeyStore interface),
 * plus the hashApiKey and generateApiKey helpers.
 */

import type { ApiKeyRecord } from '@agentapps/protocol';
import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey, InMemoryApiKeyStore } from '../src/api-key-store.js';

function makeApiKeyRecord(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  const hash = hashApiKey('aak_test1234567890abcdef12345678');
  return {
    id: 'ak_test1',
    name: 'Test Key',
    keyHash: hash,
    prefix: 'aak_test1234',
    identity: { userId: 'user1' },
    policyId: 'grt_test1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('hashApiKey', () => {
  it('produces consistent hex output', () => {
    const input = 'aak_somekeyvalue';
    const h1 = hashApiKey(input);
    const h2 = hashApiKey(input);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different inputs produce different hashes', () => {
    const h1 = hashApiKey('aak_key_one');
    const h2 = hashApiKey('aak_key_two');
    expect(h1).not.toBe(h2);
  });
});

describe('generateApiKey', () => {
  it('returns aak_ prefix', () => {
    const { raw } = generateApiKey();
    expect(raw.startsWith('aak_')).toBe(true);
  });

  it('raw, hash, prefix are all populated', () => {
    const { raw, hash, prefix } = generateApiKey();
    expect(raw.length).toBeGreaterThan(0);
    expect(hash.length).toBeGreaterThan(0);
    expect(prefix.length).toBeGreaterThan(0);
  });

  it('hash matches hashApiKey(raw)', () => {
    const { raw, hash } = generateApiKey();
    expect(hash).toBe(hashApiKey(raw));
  });

  it('prefix is first 12 chars of raw', () => {
    const { raw, prefix } = generateApiKey();
    expect(prefix).toBe(raw.slice(0, 12));
  });
});

describe('InMemoryApiKeyStore', () => {
  it('create + getByHash round-trips', async () => {
    const store = new InMemoryApiKeyStore();
    const record = makeApiKeyRecord();

    await store.create(record);
    const result = await store.getByHash(record.keyHash);
    expect(result).toEqual(record);
  });

  it('getByHash returns null for unknown hash', async () => {
    const store = new InMemoryApiKeyStore();
    const unknownHash = hashApiKey('aak_doesnotexist');
    const result = await store.getByHash(unknownHash);
    expect(result).toBeNull();
  });

  it('getByHash returns null for revoked key', async () => {
    const store = new InMemoryApiKeyStore();
    const record = makeApiKeyRecord({ revokedAt: new Date().toISOString() });

    await store.create(record);
    const result = await store.getByHash(record.keyHash);
    expect(result).toBeNull();
  });

  it('getByHash returns null for expired key', async () => {
    const store = new InMemoryApiKeyStore();
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    const record = makeApiKeyRecord({ expiresAt: pastDate });

    await store.create(record);
    const result = await store.getByHash(record.keyHash);
    expect(result).toBeNull();
  });

  it('getById works', async () => {
    const store = new InMemoryApiKeyStore();
    const record = makeApiKeyRecord();

    await store.create(record);
    const result = await store.getById('ak_test1');
    expect(result).toEqual(record);
  });

  it('list returns all keys', async () => {
    const store = new InMemoryApiKeyStore();
    const r1 = makeApiKeyRecord({ id: 'ak_1', keyHash: hashApiKey('aak_raw1') });
    const r2 = makeApiKeyRecord({ id: 'ak_2', keyHash: hashApiKey('aak_raw2') });

    await store.create(r1);
    await store.create(r2);

    const all = await store.list();
    expect(all).toHaveLength(2);
    const ids = all.map((r) => r.id).sort();
    expect(ids).toEqual(['ak_1', 'ak_2']);
  });

  it('list with userId filter', async () => {
    const store = new InMemoryApiKeyStore();
    const r1 = makeApiKeyRecord({
      id: 'ak_1',
      keyHash: hashApiKey('aak_raw1'),
      identity: { userId: 'alice' },
    });
    const r2 = makeApiKeyRecord({
      id: 'ak_2',
      keyHash: hashApiKey('aak_raw2'),
      identity: { userId: 'bob' },
    });
    const r3 = makeApiKeyRecord({
      id: 'ak_3',
      keyHash: hashApiKey('aak_raw3'),
      identity: { userId: 'alice' },
    });

    await store.create(r1);
    await store.create(r2);
    await store.create(r3);

    const aliceKeys = await store.list({ userId: 'alice' });
    expect(aliceKeys).toHaveLength(2);
    expect(aliceKeys.every((r) => r.identity.userId === 'alice')).toBe(true);

    const bobKeys = await store.list({ userId: 'bob' });
    expect(bobKeys).toHaveLength(1);
    expect(bobKeys[0].id).toBe('ak_2');
  });

  it('revoke sets revokedAt', async () => {
    const store = new InMemoryApiKeyStore();
    const record = makeApiKeyRecord();

    await store.create(record);
    const revoked = await store.revoke('ak_test1');
    expect(revoked).toBe(true);

    const result = await store.getById('ak_test1');
    expect(result?.revokedAt).toBeDefined();
  });

  it('returned records are copies (not mutable references)', async () => {
    const store = new InMemoryApiKeyStore();
    const original = makeApiKeyRecord();
    await store.create(original);

    const retrieved = await store.getByHash(original.keyHash);
    retrieved!.name = 'MUTATED';

    const again = await store.getByHash(original.keyHash);
    expect(again?.name).toBe('Test Key'); // original unchanged
  });
});
