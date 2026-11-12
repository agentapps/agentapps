/**
 * Health, client and OAuth tests for the LinkedIn Ads Agent App. The API is mocked (fetch).
 */

import { describe, expect, it } from 'vitest';
import { apiRequest, BASE_URL, LINKEDIN_VERSION, TOKEN_URL } from '../src/lib/client.js';
import { accountSearch } from './fixtures.js';
import {
  callTool,
  installationSecrets,
  jsonResponse,
  mockFetch,
  requestOf,
  runHealthCheck,
  secretUpdates,
  systemSecrets,
} from './harness.js';

const empty = { elements: [], metadata: { nextPageToken: null } };

describe('health', () => {
  it('reports ready after one cheap authenticated call', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ elements: [{ account: 'urn:li:sponsoredAccount:1', role: 'VIEWER' }] }),
    );
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    expect(String(health.message)).toContain('1 ad account role');
    const { url } = requestOf(fetchMock);
    expect(url.href).toBe(`${BASE_URL}/adAccountUsers?q=authenticatedUser`);
  });

  it('reports degraded and names the host when the API is unreachable', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(() =>
      Promise.reject(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }),
      ),
    );
    const health = await runHealthCheck();
    expect(health.status).toBe('degraded');
    expect(String(health.message)).toContain('api.linkedin.com');
  });

  it('reports not_ready with MISSING_SECRET when the account is not connected', async () => {
    delete installationSecrets.ACCESS_TOKEN;
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(JSON.stringify(health.issues)).toContain('MISSING_SECRET');
  });

  it('reports not_ready with AUTH_INVALID on a 401, without refreshing', async () => {
    const fetchMock = mockFetch(jsonResponse({ message: 'Invalid access token' }, 401));
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(JSON.stringify(health.issues)).toContain('AUTH_INVALID');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('client', () => {
  it('sends the bearer token, the pinned LinkedIn-Version and the Rest.li 2.0 header', async () => {
    const fetchMock = mockFetch(jsonResponse(empty));
    await callTool('list-ad-accounts', {});
    const headers = requestOf(fetchMock).init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer fake-access-token');
    expect(headers['LinkedIn-Version']).toBe(LINKEDIN_VERSION);
    expect(LINKEDIN_VERSION).toMatch(/^\d{6}$/);
    expect(headers['X-Restli-Protocol-Version']).toBe('2.0.0');
  });

  it('retries a GET on 503 and returns the second answer', async () => {
    const fetchMock = mockFetch(
      jsonResponse({}, 503, { 'Retry-After': '0' }),
      jsonResponse(accountSearch),
    );
    const result = await callTool('list-ad-accounts', {});
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('turns a long Retry-After on 429 into a RATE_LIMITED error without waiting', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ message: 'Too many requests' }, 429, { 'Retry-After': '120' }),
    );
    const result = await callTool('list-ad-accounts', {});
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('[RATE_LIMITED]');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries a POST after a server error', async () => {
    const fetchMock = mockFetch(jsonResponse({ message: 'Bad gateway' }, 502));
    const result = await callTool('pause-campaign', { accountId: 1, campaignId: 2 });
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("quotes LinkedIn's error message and caps a long non-JSON body", async () => {
    mockFetch(jsonResponse({ message: 'Invalid value for field status', status: 400 }, 400));
    const first = await callTool('list-ad-accounts', {});
    expect(JSON.stringify(first.error)).toContain('[BAD_REQUEST]');
    expect(JSON.stringify(first.error)).toContain('Invalid value for field status');

    mockFetch(new Response('x'.repeat(10_000), { status: 500, statusText: 'Server Error' }));
    const second = await callTool('list-ad-accounts', {});
    const message = JSON.stringify(second.error);
    expect(message).toContain('500');
    expect(message.length).toBeLessThan(3_000);
  });

  it('names the missing scope and the role on a 403', async () => {
    mockFetch(jsonResponse({ message: 'Not enough permissions to access: adAnalytics' }, 403));
    const result = await callTool('get-ad-analytics', { accountId: 1, startDate: '2026-05-01' });
    expect(JSON.stringify(result.error)).toContain('[FORBIDDEN]');
    expect(JSON.stringify(result.error)).toContain('r_ads_reporting');
  });

  it('reports a timeout with the host and the deadline', async () => {
    const fetchMock = mockFetch();
    // Hang until the client's own deadline aborts the request.
    fetchMock.mockImplementation(
      (_url: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const ctx = {
      secrets: { getInstallation: async () => ({ ACCESS_TOKEN: 'fake-access-token' }) },
    };
    await expect(apiRequest('GET', '/adAccounts', ctx, { timeoutMs: 50 })).rejects.toThrow(
      '[LINKEDIN_ADS_TIMEOUT] api.linkedin.com did not answer within 0.05 s.',
    );
  });

  it('never puts a secret value in an error message', async () => {
    mockFetch(
      jsonResponse({ message: 'nope' }, 401),
      jsonResponse({ error: 'invalid_grant' }, 400),
    );
    const result = await callTool('list-ad-accounts', {});
    expect(result.success).toBe(false);
    for (const value of [...Object.values(installationSecrets), ...Object.values(systemSecrets)]) {
      expect(JSON.stringify(result)).not.toContain(value);
    }
  });
});

describe('OAuth token refresh', () => {
  it('refreshes on a 401, persists the new token and replays the request once', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ message: 'Expired token' }, 401),
      jsonResponse({
        access_token: 'fresh-access-token',
        expires_in: 5184000,
        refresh_token: 'fresh-refresh-token',
        refresh_token_expires_in: 31536000,
        scope: 'r_ads,r_ads_reporting,rw_ads',
      }),
      jsonResponse(accountSearch),
    );
    const result = await callTool('list-ad-accounts', {});
    expect(result.success).toBe(true);

    const refresh = requestOf(fetchMock, 1);
    expect(refresh.url.href).toBe(TOKEN_URL);
    expect(refresh.init.method).toBe('POST');
    const form = new URLSearchParams(String(refresh.init.body));
    expect(Object.fromEntries(form)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'fake-refresh-token',
      client_id: 'fake-client-id',
      client_secret: 'fake-client-secret',
    });

    const replay = requestOf(fetchMock, 2).init.headers as Record<string, string>;
    expect(replay.Authorization).toBe('Bearer fresh-access-token');
    expect(secretUpdates).toHaveLength(1);
    expect(secretUpdates[0].ACCESS_TOKEN).toBe('fresh-access-token');
    expect(secretUpdates[0].REFRESH_TOKEN).toBe('fresh-refresh-token');
    expect(Date.parse(secretUpdates[0].EXPIRY_DATE)).toBeGreaterThan(Date.now());
  });

  it('replays a POST once after a refresh, since the 401 was never processed', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ message: 'Expired token' }, 401),
      jsonResponse({ access_token: 'fresh-access-token', expires_in: 5184000 }),
      new Response(null, { status: 204 }),
    );
    const result = await callTool('pause-campaign', { accountId: 1, campaignId: 2 });
    expect(result.success).toBe(true);
    expect(requestOf(fetchMock, 2).init.method).toBe('POST');
  });

  it('asks to reconnect when there is no refresh token (non-partner apps)', async () => {
    delete installationSecrets.REFRESH_TOKEN;
    const fetchMock = mockFetch(jsonResponse({ message: 'Expired token' }, 401));
    const result = await callTool('list-ad-accounts', {});
    const message = JSON.stringify(result.error);
    expect(message).toContain('[AUTH_EXPIRED]');
    expect(message).toContain('60');
    expect(message).toContain('auth reauth');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks to reconnect when LinkedIn refuses the refresh token', async () => {
    mockFetch(
      jsonResponse({ message: 'Expired token' }, 401),
      jsonResponse({ error: 'invalid_request', error_description: 'expired' }, 400),
    );
    const result = await callTool('list-ad-accounts', {});
    expect(JSON.stringify(result.error)).toContain('[AUTH_EXPIRED] LinkedIn refused to refresh');
  });

  it('points at the config command when the OAuth client is not configured', async () => {
    delete systemSecrets.CLIENT_SECRET;
    mockFetch(jsonResponse({ message: 'Expired token' }, 401));
    const result = await callTool('list-ad-accounts', {});
    const message = JSON.stringify(result.error);
    expect(message).toContain('[SYSTEM_CONFIG_MISSING]');
    expect(message).toContain('agentapps config app.linkedin-ads CLIENT_ID');
  });

  it('gives up with AUTH_EXPIRED when the refreshed token is rejected too', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ message: 'Expired token' }, 401),
      jsonResponse({ access_token: 'fresh-access-token', expires_in: 5184000 }),
      jsonResponse({ message: 'Revoked' }, 401),
    );
    const result = await callTool('list-ad-accounts', {});
    expect(JSON.stringify(result.error)).toContain('[AUTH_EXPIRED]');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('asks to connect the account when no access token is stored', async () => {
    delete installationSecrets.ACCESS_TOKEN;
    const fetchMock = mockFetch();
    const result = await callTool('list-ad-accounts', {});
    expect(JSON.stringify(result.error)).toContain('[AUTH_REQUIRED]');
    expect(JSON.stringify(result.error)).toContain('agentapps <alias> auth');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
