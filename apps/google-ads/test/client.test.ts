/**
 * Health, auth and HTTP client behaviour, with the Google Ads API mocked (fetch).
 */

import { describe, expect, it } from 'vitest';
import { BASE_URL } from '../src/lib/client.js';
import {
  adsFailure,
  BUSY_METRICS,
  CUSTOMER,
  campaignRow,
  MANAGER,
  searchPage,
  sent,
} from './fixtures.js';
import {
  callTool,
  installationSecrets,
  jsonResponse,
  mockFetch,
  refresh,
  runHealthCheck,
  systemSecrets,
} from './harness.js';

const listAccessible = () => jsonResponse({ resourceNames: [`customers/${CUSTOMER}`] });
const summaryArgs = { customerId: CUSTOMER };

describe('health', () => {
  it('reports ready and sends the OAuth token and the developer token, without login-customer-id', async () => {
    const fetchMock = mockFetch(listAccessible());
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    expect(health.message).toContain('1 account accessible');
    const req = sent(fetchMock);
    expect(req.url.href).toBe(`${BASE_URL}/customers:listAccessibleCustomers`);
    expect(req.method).toBe('GET');
    expect(req.headers.Authorization).toBe('Bearer fake-access-token');
    expect(req.headers['developer-token']).toBe('fake-developer-token');
    expect(req.headers['login-customer-id']).toBeUndefined();
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
    expect(String(health.message)).toContain('googleads.googleapis.com');
    expect(String(health.message)).toContain('ENOTFOUND');
  });

  it('reports not_ready with MISSING_SECRET and the config command when the developer token is missing', async () => {
    delete systemSecrets.DEVELOPER_TOKEN;
    const fetchMock = mockFetch();
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(JSON.stringify(health.issues)).toContain('MISSING_SECRET');
    expect(String(health.message)).toContain(
      'agentapps config app.google.ads DEVELOPER_TOKEN:<value>',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports not_ready when no Google account is connected', async () => {
    for (const key of Object.keys(installationSecrets)) delete installationSecrets[key];
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(String(health.message)).toContain('[AUTH_REQUIRED]');
    expect(String(health.message)).toContain('agentapps <alias> auth');
  });

  it('reports not_ready (not degraded) when the token is rejected and cannot be refreshed', async () => {
    refresh.error = 'invalid_grant';
    mockFetch(jsonResponse({ error: { code: 401, status: 'UNAUTHENTICATED' } }, 401));
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(String(health.message)).toContain('[AUTH_EXPIRED]');
  });
});

describe('auth', () => {
  it('asks the host to refresh an expired token before calling, then uses the new one', async () => {
    installationSecrets.EXPIRY_DATE = new Date(Date.now() - 1_000).toISOString();
    const fetchMock = mockFetch(searchPage([campaignRow('1', 'x', BUSY_METRICS)]));
    const result = await callTool('get-account-summary', summaryArgs);
    expect(result.success).toBe(true);
    expect(refresh.calls).toBe(1);
    expect(sent(fetchMock).headers.Authorization).toBe('Bearer fake-refreshed-token');
    // The new expiry is stored, so the next call does not refresh again.
    expect(installationSecrets.EXPIRY_DATE).toBe('2099-01-01T00:00:00.000Z');
  });

  it('accepts EXPIRY_DATE as epoch milliseconds too', async () => {
    installationSecrets.EXPIRY_DATE = String(Date.now() + 3_600_000);
    mockFetch(searchPage([campaignRow('1', 'x')]));
    const result = await callTool('get-account-summary', summaryArgs);
    expect(result.success).toBe(true);
    expect(refresh.calls).toBe(0);
  });

  it('refreshes once after a 401 and replays the request, also for a mutate', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ error: { code: 401, status: 'UNAUTHENTICATED' } }, 401),
      jsonResponse({ results: [{ resourceName: `customers/${CUSTOMER}/campaigns/111` }] }),
    );
    const result = await callTool('pause-campaign', { customerId: CUSTOMER, campaignId: 111 });
    expect(result.success).toBe(true);
    expect(refresh.calls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sent(fetchMock, 1).headers.Authorization).toBe('Bearer fake-refreshed-token');
  });

  it('asks to reconnect when a 401 survives the refresh', async () => {
    mockFetch(
      jsonResponse({ error: { code: 401, status: 'UNAUTHENTICATED' } }, 401),
      jsonResponse({ error: { code: 401, status: 'UNAUTHENTICATED' } }, 401),
    );
    const result = await callTool('get-account-summary', summaryArgs);
    expect(result.success).toBe(false);
    const message = JSON.stringify(result.error);
    expect(message).toContain('[AUTH_EXPIRED]');
    expect(message).toContain('agentapps <alias> auth');
    expect(refresh.calls).toBe(1);
  });

  it('asks to reconnect when the host cannot refresh', async () => {
    installationSecrets.EXPIRY_DATE = new Date(Date.now() - 1_000).toISOString();
    refresh.error = 'invalid_grant';
    const fetchMock = mockFetch();
    const result = await callTool('get-account-summary', summaryArgs);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('refresh token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains how to set a missing developer token, before any request', async () => {
    delete systemSecrets.DEVELOPER_TOKEN;
    const fetchMock = mockFetch();
    const result = await callTool('list-accessible-customers', {});
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('DEVELOPER_TOKEN');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends login-customer-id (dashes removed) only when loginCustomerId is given', async () => {
    const fetchMock = mockFetch(searchPage([campaignRow('1', 'x')]));
    await callTool('get-account-summary', {
      customerId: CUSTOMER,
      loginCustomerId: '987-654-3210',
    });
    expect(sent(fetchMock).headers['login-customer-id']).toBe(MANAGER);
  });
});

describe('client', () => {
  it('turns a GoogleAdsFailure into its error code, a hint and the request id', async () => {
    mockFetch(
      adsFailure(403, 'PERMISSION_DENIED', [
        {
          errorCode: { authorizationError: 'USER_PERMISSION_DENIED' },
          message:
            "User doesn't have permission to access customer. Note: If you're accessing a client customer, the manager's customer id must be set in the 'login-customer-id' header.",
        },
      ]),
    );
    const result = await callTool('get-account-summary', summaryArgs);
    expect(result.success).toBe(false);
    const message = JSON.stringify(result.error);
    expect(message).toContain('[PERMISSION_DENIED] 403');
    expect(message).toContain('authorizationError.USER_PERMISSION_DENIED');
    expect(message).toContain('loginCustomerId');
    expect(message).toContain('synthetic-request-id-1');
  });

  it('explains the developer token access level', async () => {
    mockFetch(
      adsFailure(403, 'PERMISSION_DENIED', [
        {
          errorCode: { authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' },
          message: 'The developer token is only approved for use with test accounts.',
        },
      ]),
    );
    const result = await callTool('get-account-summary', summaryArgs);
    expect(JSON.stringify(result.error)).toContain('Basic or Standard access');
  });

  it('retries the read-only search POST on 503', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ error: { code: 503, status: 'UNAVAILABLE' } }, 503, { 'Retry-After': '0' }),
      searchPage([campaignRow('1', 'x', BUSY_METRICS)]),
    );
    const result = await callTool('get-account-summary', summaryArgs);
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries a mutate that got an answer', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ error: { code: 503, status: 'UNAVAILABLE' } }, 503, { 'Retry-After': '0' }),
    );
    const result = await callTool('pause-campaign', { customerId: CUSTOMER, campaignId: 111 });
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.error)).toContain('503');
  });

  it('never retries a mutate after a network error either', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(() =>
      Promise.reject(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }),
      ),
    );
    const result = await callTool('pause-campaign', { customerId: CUSTOMER, campaignId: 111 });
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.error)).toContain('[GOOGLE_ADS_UNREACHABLE]');
  });

  it('reports a long rate-limit wait as RATE_LIMITED instead of waiting', async () => {
    const fetchMock = mockFetch(
      adsFailure(429, 'RESOURCE_EXHAUSTED', [
        { errorCode: { quotaError: 'RESOURCE_EXHAUSTED' }, message: 'Too many requests.' },
      ]),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 429, { 'Retry-After': '60' }));
    const result = await callTool('get-account-summary', summaryArgs);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('[RATE_LIMITED]');
  });

  it('caps a long error body', async () => {
    mockFetch(new Response('x'.repeat(10_000), { status: 500, statusText: 'Server Error' }));
    const result = await callTool('pause-campaign', { customerId: CUSTOMER, campaignId: 1 });
    expect(result.success).toBe(false);
    const message = JSON.stringify(result.error);
    expect(message).toContain('500');
    expect(message.length).toBeLessThan(3_000);
  });

  it('never puts a secret value in an error message', async () => {
    refresh.error = 'invalid_grant';
    mockFetch(jsonResponse({ error: { code: 401, status: 'UNAUTHENTICATED' } }, 401));
    const result = await callTool('get-account-summary', summaryArgs);
    expect(result.success).toBe(false);
    for (const value of [...Object.values(installationSecrets), ...Object.values(systemSecrets)]) {
      if (value.startsWith('fake-')) expect(JSON.stringify(result)).not.toContain(value);
    }
  });
});
