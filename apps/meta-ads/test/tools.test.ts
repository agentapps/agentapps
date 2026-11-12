/**
 * Health and client tests for the Meta Ads Agent App. The API is mocked (fetch); mock
 * bodies follow real Graph API shapes (see fixtures.ts).
 */

import { describe, expect, it } from 'vitest';
import { BASE_URL } from '../src/lib/client.js';
import { ACCOUNT_ID, adAccount, graphError, page } from './fixtures.js';
import {
  callTool,
  installationSecrets,
  jsonResponse,
  mockFetch,
  requestOf,
  runHealthCheck,
} from './harness.js';

describe('health', () => {
  it('reports ready with the token owner, using one cheap /me call', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: '10001', name: 'Reporting System User' }));
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    expect(String(health.message)).toContain('Reporting System User');
    const { url, init } = requestOf(fetchMock);
    expect(url.href).toBe(`${BASE_URL}/me?fields=id%2Cname`);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer fake-meta_access_token',
    );
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
    expect(String(health.message)).toContain('graph.facebook.com');
  });

  it('reports degraded with AUTH_REQUIRED when the token is expired', async () => {
    mockFetch(
      jsonResponse(
        graphError(190, 'Error validating access token: Session has expired.', {
          error_subcode: 463,
        }),
        400,
      ),
    );
    const health = await runHealthCheck();
    expect(health.status).toBe('degraded');
    expect(String(health.message)).toContain('[AUTH_REQUIRED]');
  });

  it('reports not_ready with MISSING_SECRET when the token is missing', async () => {
    delete installationSecrets.META_ACCESS_TOKEN;
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(JSON.stringify(health.issues)).toContain('MISSING_SECRET');
    expect(String(health.message)).toContain('agentapps config <alias> META_ACCESS_TOKEN');
  });
});

describe('client', () => {
  it('pins the Graph API version', () => {
    expect(BASE_URL).toBe('https://graph.facebook.com/v26.0');
  });

  it('refuses every tool call without a token, before any request', async () => {
    delete installationSecrets.META_ACCESS_TOKEN;
    const fetchMock = mockFetch();
    const result = await callTool('list-ad-accounts', {});
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the token in the Authorization header, never in the URL', async () => {
    const fetchMock = mockFetch(jsonResponse(page([adAccount])));
    await callTool('list-ad-accounts', {});
    const { url, init } = requestOf(fetchMock);
    expect(url.href).not.toContain('fake-meta_access_token');
    expect(url.searchParams.has('access_token')).toBe(false);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer fake-meta_access_token',
    );
  });

  it('retries a GET on 503 and returns the second answer', async () => {
    const fetchMock = mockFetch(
      jsonResponse({}, 503, { 'Retry-After': '0' }),
      jsonResponse(page([adAccount])),
    );
    const result = await callTool('list-ad-accounts', {});
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries a POST', async () => {
    const fetchMock = mockFetch(jsonResponse({}, 503, { 'Retry-After': '0' }));
    const result = await callTool('create-campaign', {
      accountId: ACCOUNT_ID,
      name: 'X',
      objective: 'OUTCOME_TRAFFIC',
    });
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [4, undefined, 'Application request limit reached', 'RATE_LIMITED'],
    [17, 2446079, 'User request limit reached', 'RATE_LIMITED'],
    [613, 1487742, 'There have been too many calls from this ad-account.', 'RATE_LIMITED'],
    [80004, undefined, 'There have been too many calls to this ad-account.', 'RATE_LIMITED'],
    [190, 460, 'Error validating access token', 'AUTH_REQUIRED'],
    [200, undefined, 'Requires ads_read permission', 'FORBIDDEN'],
    [10, undefined, 'Application does not have permission for this action', 'FORBIDDEN'],
    [100, 33, 'Unsupported get request. Object with ID does not exist', 'NOT_FOUND'],
    [100, undefined, 'Invalid parameter', 'BAD_REQUEST'],
    [2, undefined, 'An unexpected error has occurred.', 'META_ADS_ERROR'],
  ])('maps Graph error code %s/%s ("%s", HTTP 400) to [%s]', async (code, subcode, message, label) => {
    const extra = subcode ? { error_subcode: subcode } : {};
    // Meta sends rate limits and most errors as HTTP 400, not 429.
    const fetchMock = mockFetch(jsonResponse(graphError(code, message, extra), 400));
    const result = await callTool('list-ad-accounts', {});
    expect(result.success).toBe(false);
    const error = JSON.stringify(result.error);
    expect(error).toContain(`[${label}]`);
    expect(error).toContain(message);
    expect(error).toContain('AbCdEfGhIjKlMnOp');
    // A 400 is not retried.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('quotes the user-facing message Meta adds to an error', async () => {
    mockFetch(
      jsonResponse(
        graphError(100, 'Invalid parameter', {
          error_subcode: 1885183,
          error_user_title: 'Budget too low',
          error_user_msg: 'Your budget must be at least 1.00 EUR.',
        }),
        400,
      ),
    );
    const result = await callTool('list-ad-accounts', {});
    expect(JSON.stringify(result.error)).toContain('Budget too low: Your budget must be at least');
  });

  it('caps a long non-JSON error body and reports the status after the retries', async () => {
    const serverError = () =>
      new Response('x'.repeat(10_000), {
        status: 500,
        statusText: 'Server Error',
        headers: { 'Retry-After': '0' },
      });
    const fetchMock = mockFetch(serverError(), serverError(), serverError());
    const result = await callTool('list-ad-accounts', {});
    expect(result.success).toBe(false);
    const message = JSON.stringify(result.error);
    expect(message).toContain('500');
    expect(message.length).toBeLessThan(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never puts the token in an error message', async () => {
    mockFetch(jsonResponse(graphError(190, 'Malformed access token'), 401));
    const result = await callTool('list-ad-accounts', {});
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain(installationSecrets.META_ACCESS_TOKEN);
  });

  it('reports a timeout with its own message', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(
      (_url: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const { apiRequest } = await import('../src/lib/client.js');
    const ctx = { secrets: { getInstallation: async () => ({ META_ACCESS_TOKEN: 'fake' }) } };
    await expect(apiRequest('GET', '/me', ctx, { timeoutMs: 50 })).rejects.toThrow(
      /\[META_ADS_TIMEOUT\] graph\.facebook\.com did not answer within 0\.05 s/,
    );
  });
});
