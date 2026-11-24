/**
 * Setup instructions and the one OAuth redirect URI of a Station (SETUP).
 */

import { createServer, get as httpGet, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ApiKeyRecord } from '@agentapps/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { generateApiKey, InMemoryApiKeyStore } from '../src/api-key-store.js';
import { InMemoryDataStore, InMemorySecretStore } from '../src/index.js';
import { InMemoryPolicyStore } from '../src/policy-store.js';
import { type AppEntry, StationServer, type StationServerOptions } from '../src/server.js';

const PUBLIC_URL = 'https://station.example.com';
const REDIRECT_URI = `${PUBLIC_URL}/auth/callback`;
const ADMIN_TOKEN = 'admin-token-for-tests';
const CLIENT_SECRET = 'client-secret-value-that-must-not-leak';

function keyRecord(id: string, hash: string): ApiKeyRecord {
  const now = new Date().toISOString();
  return {
    id,
    name: `key-${id}`,
    keyHash: hash,
    prefix: 'aak_test',
    identity: { userId: 'user-1' },
    principalId: id,
    createdAt: now,
    updatedAt: now,
  };
}

/** A GET with headers `fetch` does not let a caller set, such as `Host`. */
function getWithHeaders(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    httpGet(
      { host: target.hostname, port: target.port, path: target.pathname + target.search, headers },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    ).on('error', reject);
  });
}

describe('StationServer setup instructions and redirect URI', () => {
  let server: StationServer | undefined;
  let tokenEndpoint: Server | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
    await new Promise<void>((done) => (tokenEndpoint ? tokenEndpoint.close(() => done()) : done()));
    tokenEndpoint = undefined;
  });

  /** A token endpoint that records the form body of each exchange. */
  async function startTokenEndpoint(bodies: string[]): Promise<string> {
    tokenEndpoint = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        bodies.push(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }));
      });
    });
    await new Promise<void>((done) => tokenEndpoint?.listen(0, '127.0.0.1', done));
    return `http://127.0.0.1:${(tokenEndpoint.address() as AddressInfo).port}/token`;
  }

  function oauthApp(tokenUrl: string, setup?: string): AppEntry {
    const auth = {
      type: 'oauth2',
      provider: 'google',
      authorizeUrl: 'https://accounts.example.com/authorize',
      tokenUrl,
      scopes: ['email'],
      ...(setup ? { setup } : {}),
    };
    return {
      id: 'app.oauth',
      version: '1.0.0',
      factory: () => {},
      auth,
      manifest: { id: 'app.oauth', version: '1.0.0', auth },
    };
  }

  async function start(options: Partial<StationServerOptions>): Promise<string> {
    const secretStore = new InMemorySecretStore();
    await secretStore.setSystemSecrets(
      { stationId: 'stn_test', appId: 'app.oauth' },
      { CLIENT_ID: 'client-id', CLIENT_SECRET },
    );
    server = new StationServer({
      stationId: 'stn_test',
      workspaceId: 'ws_test',
      secretStore,
      dataStore: new InMemoryDataStore(),
      publicUrl: PUBLIC_URL,
      adminToken: ADMIN_TOKEN,
      resolveInstallation: () => ({ appId: 'app.oauth' }),
      ...options,
    });
    const info = await server.start(0, '127.0.0.1');
    return info.url;
  }

  const admin = { Authorization: `Bearer ${ADMIN_TOKEN}` };

  it('[SETUP-AC-2] the authorize URL, the token exchange and the instructions carry the same redirect URI', async () => {
    const exchanges: string[] = [];
    const tokenUrl = await startTokenEndpoint(exchanges);
    const url = await start({
      apps: [oauthApp(tokenUrl, 'Add this redirect URI: {{redirectUri}}')],
    });

    const started = (await (await fetch(`${url}/auth/start?installationId=ins_1`)).json()) as {
      url: string;
      state: string;
    };
    expect(new URL(started.url).searchParams.get('redirect_uri')).toBe(REDIRECT_URI);

    const callback = await fetch(`${url}/auth/callback?code=the-code&state=${started.state}`);
    expect(callback.status).toBe(200);
    expect(exchanges).toHaveLength(1);
    expect(new URLSearchParams(exchanges[0]).get('redirect_uri')).toBe(REDIRECT_URI);

    const setup = await fetch(`${url}/apps/app.oauth/setup`, { headers: admin });
    expect(setup.status).toBe(200);
    expect(await setup.json()).toEqual({
      instructions: `Add this redirect URI: ${REDIRECT_URI}`,
    });
  });

  it('[SETUP-AC-4] an app with no setup instructions answers that there are none', async () => {
    const url = await start({ apps: [oauthApp('https://accounts.example.com/token')] });

    const setup = await fetch(`${url}/apps/app.oauth/setup`, { headers: admin });
    expect(setup.status).toBe(200);
    expect(await setup.json()).toEqual({ instructions: null });
  });

  it('[SETUP-AC-11] resolved instructions do not contain a stored secret', async () => {
    const url = await start({
      apps: [
        oauthApp(
          'https://accounts.example.com/token',
          'Register {{redirectUri}} and copy the client secret',
        ),
      ],
    });

    const body = await (await fetch(`${url}/apps/app.oauth/setup`, { headers: admin })).text();
    expect(body).toContain(REDIRECT_URI);
    expect(body).not.toContain(CLIENT_SECRET);
    expect(body).not.toContain('client-id');
  });

  it('[SETUP-AC-12] the redirect URI ignores the Host and X-Forwarded-Host headers of a request', async () => {
    const url = await start({ apps: [oauthApp('https://accounts.example.com/token')] });

    const spoofed = await getWithHeaders(`${url}/auth/start?installationId=ins_1`, {
      Host: 'other.example.net',
      'X-Forwarded-Host': 'forwarded.example.org',
      'X-Forwarded-Proto': 'https',
    });
    expect(spoofed.status).toBe(200);
    const authorizeUrl = (JSON.parse(spoofed.body) as { url: string }).url;
    expect(new URL(authorizeUrl).searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
  });

  it('[SETUP-AC-12] a Station cannot be created without a public URL', () => {
    const rest = {
      stationId: 'stn_test',
      workspaceId: 'ws_test',
      secretStore: new InMemorySecretStore(),
      dataStore: new InMemoryDataStore(),
    };
    expect(() => new StationServer(rest as StationServerOptions)).toThrow(/public URL/);
    expect(() => new StationServer({ ...rest, publicUrl: '' })).toThrow(/public URL/);
    expect(() => new StationServer({ ...rest, publicUrl: 'not a url' })).toThrow(/not a URL/);
    expect(() => new StationServer({ ...rest, publicUrl: 'ftp://station.example.com' })).toThrow(
      /http or https/,
    );
  });

  it('[SETUP-AC-14] only the admin reads setup instructions', async () => {
    const keys = new InMemoryApiKeyStore();
    const other = generateApiKey();
    await keys.create(keyRecord('ak_other', other.hash));
    const url = await start({
      apps: [oauthApp('https://accounts.example.com/token', 'Register {{redirectUri}}')],
      apiKeys: keys,
      policies: new InMemoryPolicyStore(),
    });

    const asAdmin = await fetch(`${url}/apps/app.oauth/setup`, { headers: admin });
    expect(asAdmin.status).toBe(200);
    expect(await asAdmin.json()).toEqual({ instructions: `Register ${REDIRECT_URI}` });

    const asOther = await fetch(`${url}/apps/app.oauth/setup`, {
      headers: { Authorization: `Bearer ${other.raw}` },
    });
    expect(asOther.status).toBe(403);
    expect(await asOther.text()).not.toContain(REDIRECT_URI);

    const anonymous = await fetch(`${url}/apps/app.oauth/setup`);
    expect(anonymous.status).toBe(401);
    expect(await anonymous.text()).not.toContain(REDIRECT_URI);
  });

  it('with no API key, a request from this machine without a credential is the admin', async () => {
    const url = await start({
      apps: [oauthApp('https://accounts.example.com/token', 'Register {{redirectUri}}')],
      adminToken: undefined,
      openToLoopbackOnly: true,
      apiKeys: new InMemoryApiKeyStore(),
      policies: new InMemoryPolicyStore(),
    });

    const setup = await fetch(`${url}/apps/app.oauth/setup`);
    expect(setup.status).toBe(200);
    expect(await setup.json()).toEqual({ instructions: `Register ${REDIRECT_URI}` });
  });

  it('an unknown app is not found', async () => {
    const url = await start({ apps: [] });
    const setup = await fetch(`${url}/apps/app.absent/setup`, { headers: admin });
    expect(setup.status).toBe(404);
  });
});
