/**
 * ApiKeyStore — persistence layer for API key records.
 *
 * API keys authenticate callers and link them to a Policy (permission
 * policy). Keys are stored as SHA-256 hashes — the raw key is returned
 * exactly once at creation and never persisted.
 *
 * Pluggable: in-memory for dev/tests, database-backed for production.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { ApiKeyRecord } from '@agentapps/protocol';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the SHA-256 hex digest of a raw API key. */
export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Generate a new API key with `aak_` prefix (32 random hex chars). */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const bytes = randomBytes(16); // 16 bytes = 32 hex chars
  const hex = bytes.toString('hex');
  const raw = `aak_${hex}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 12) };
}

// ---------------------------------------------------------------------------
// ApiKeyStore interface
// ---------------------------------------------------------------------------

export interface ApiKeyStore {
  /** Store a new API key record. */
  create(record: ApiKeyRecord): Promise<void>;

  /** Look up by key hash (the hot-path for every authenticated request). */
  getByHash(keyHash: string): Promise<ApiKeyRecord | null>;

  /** Look up by ID (for management). */
  getById(id: string): Promise<ApiKeyRecord | null>;

  /** List all keys (optionally filtered). Returns records without keyHash. */
  list(filter?: { userId?: string }): Promise<ApiKeyRecord[]>;

  /** Soft-revoke a key by ID. Returns true if found. */
  revoke(id: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// In-memory implementation (dev/test)
// ---------------------------------------------------------------------------

export class InMemoryApiKeyStore implements ApiKeyStore {
  private readonly byId = new Map<string, ApiKeyRecord>();
  private readonly byHash = new Map<string, string>(); // hash -> id

  async create(record: ApiKeyRecord): Promise<void> {
    this.byId.set(record.id, { ...record });
    this.byHash.set(record.keyHash, record.id);
  }

  async getByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    // Walk the hash index using timing-safe comparison to avoid
    // leaking which hash prefix matched via timing side-channels.
    const keyHashBuf = Buffer.from(keyHash, 'hex');

    let matchedId: string | undefined;
    for (const [storedHash, id] of this.byHash) {
      const storedBuf = Buffer.from(storedHash, 'hex');
      if (storedBuf.length === keyHashBuf.length && timingSafeEqual(storedBuf, keyHashBuf)) {
        matchedId = id;
        break;
      }
    }

    if (!matchedId) return null;

    const record = this.byId.get(matchedId);
    if (!record) return null;

    // Skip revoked keys.
    if (record.revokedAt) return null;

    // Skip expired keys.
    if (record.expiresAt && new Date(record.expiresAt) <= new Date()) return null;

    return { ...record };
  }

  async getById(id: string): Promise<ApiKeyRecord | null> {
    const record = this.byId.get(id);
    return record ? { ...record } : null;
  }

  async list(filter?: { userId?: string }): Promise<ApiKeyRecord[]> {
    let records = [...this.byId.values()];

    if (filter?.userId) {
      records = records.filter((r) => r.identity.userId === filter.userId);
    }

    // Return copies without keyHash.
    return records.map(({ keyHash: _, ...rest }) => rest as ApiKeyRecord);
  }

  async revoke(id: string): Promise<boolean> {
    const record = this.byId.get(id);
    if (!record) return false;

    record.revokedAt = new Date().toISOString();
    return true;
  }

  /** Test helper: get the current count. */
  get size(): number {
    return this.byId.size;
  }
}
