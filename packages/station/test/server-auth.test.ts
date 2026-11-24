/**
 * StationServer authentication gating tests.
 *
 * Auth must be enforced only once a legacy token is configured or at least
 * one active API key exists: an empty (or fully revoked) key store keeps the
 * station open, so wiring a store into an existing deployment is not a
 * breaking change — creating the first key is what switches auth on.
 */

import type { ApiKeyRecord } from '@agentapps/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { generateApiKey, InMemoryApiKeyStore } from '../src/api-key-store.js';
import { InMemoryDataStore, InMemorySecretStore } from '../src/index.js';
import { InMemoryPolicyStore } from '../src/policy-store.js';
import { StationServer } from '../src/server.js';

function makeKeyRecord(id: string, hash: string, extra?: Partial<ApiKeyRecord>): ApiKeyRecord {
  const now = new Date().toISOString();
  return {
    id,
    name: `key-${id}`,
    keyHash: hash,
    prefix: 'aak_test',
    identity: { userId: 'user-1' },
    policyId: 'grt_1',
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

describe('StationServer auth gating', () => {
  let server: StationServer | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  async function startServer(apiKeys: InMemoryApiKeyStore): Promise<string> {
    server = new StationServer({
      stationId: 'stn_test',
      workspaceId: 'ws_test',
      secretStore: new InMemorySecretStore(),
      dataStore: new InMemoryDataStore(),
      publicUrl: 'http://station.test',
      apps: [],
      apiKeys,
      policies: new InMemoryPolicyStore(),
    });
    const info = await server.start(0, '127.0.0.1');
    return info.url;
  }

  function postMessages(url: string, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(`${url}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: '{}',
    });
  }

  it('stays open while the key store is empty', async () => {
    const url = await startServer(new InMemoryApiKeyStore());

    const resp = await postMessages(url);
    // 404 (no matching app) proves the request got past authentication.
    expect(resp.status).toBe(404);
  });

  it('requires a key once an active key exists, and accepts that key', async () => {
    const store = new InMemoryApiKeyStore();
    const { raw, hash } = generateApiKey();
    await store.create(makeKeyRecord('ak_1', hash));
    const url = await startServer(store);

    const unauthenticated = await postMessages(url);
    expect(unauthenticated.status).toBe(401);

    const wrongKey = await postMessages(url, { Authorization: 'Bearer aak_wrong' });
    expect(wrongKey.status).toBe(401);

    const authenticated = await postMessages(url, { Authorization: `Bearer ${raw}` });
    expect(authenticated.status).toBe(404);
  });

  it('reopens when every key is revoked', async () => {
    const store = new InMemoryApiKeyStore();
    const { hash } = generateApiKey();
    await store.create(makeKeyRecord('ak_1', hash));
    await store.revoke('ak_1');
    const url = await startServer(store);

    const resp = await postMessages(url);
    expect(resp.status).toBe(404);
  });

  it('ignores expired keys when deciding whether auth is required', async () => {
    const store = new InMemoryApiKeyStore();
    const { hash } = generateApiKey();
    await store.create(
      makeKeyRecord('ak_expired', hash, {
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    );
    const url = await startServer(store);

    const resp = await postMessages(url);
    expect(resp.status).toBe(404);
  });
});
