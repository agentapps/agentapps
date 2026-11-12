/**
 * Health and HTTP client tests: OAuth token use and refresh through the host, Google error
 * mapping, retries and network failures. The API is mocked (fetch).
 */

import { describe, expect, it } from 'vitest';
import { ANALYTICS_BASE_URL } from '../src/lib/client.js';
import { googleError, totalsTable } from './fixtures.js';
import {
  callTool,
  hostCalls,
  installationSecrets,
  jsonResponse,
  mockFetch,
  requestOf,
  runHealthCheck,
  setRefreshReply,
} from './harness.js';

const authHeader = (init: RequestInit) =>
  (init.headers as Record<string, string> | undefined)?.Authorization;

describe('health', () => {
  it('reports ready after one cheap analytics query with the bearer token', async () => {
    const fetchMock = mockFetch(jsonResponse(totalsTable));
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    const { url, init } = requestOf(fetchMock);
    expect(`${url.origin}${url.pathname}`).toBe(`${ANALYTICS_BASE_URL}/reports`);
    expect(url.searchParams.get('ids')).toBe('channel==MINE');
    expect(url.searchParams.get('metrics')).toBe('views');
    expect(url.searchParams.get('startDate')).toBe(url.searchParams.get('endDate'));
    expect(authHeader(init)).toBe('Bearer fake-access-token');
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
    expect(String(health.message)).toContain('youtubeanalytics.googleapis.com');
    expect(String(health.message)).toContain('ENOTFOUND');
  });

  it('reports not_ready with MISSING_SECRET when no account is connected', async () => {
    for (const key of Object.keys(installationSecrets)) delete installationSecrets[key];
    const fetchMock = mockFetch();
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(JSON.stringify(health.issues)).toContain('MISSING_SECRET');
    expect(String(health.message)).toContain('agentapps <alias> auth');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports not_ready naming the scopes when the token lacks one', async () => {
    mockFetch(
      jsonResponse(
        googleError(
          403,
          'Request had insufficient authentication scopes.',
          'insufficientPermissions',
          'PERMISSION_DENIED',
        ),
        403,
      ),
    );
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(String(health.message)).toContain('[MISSING_SCOPE]');
    expect(String(health.message)).toContain('yt-analytics.readonly');
  });
});

describe('client: OAuth', () => {
  it('refreshes through the host on a 401, replays once and stores the new token', async () => {
    const fetchMock = mockFetch(
      jsonResponse(
        googleError(
          401,
          'Request had invalid authentication credentials.',
          'authError',
          'UNAUTHENTICATED',
        ),
        401,
      ),
      jsonResponse(totalsTable),
    );
    const result = await callTool('get-channel-report', {});
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeader(requestOf(fetchMock, 0).init)).toBe('Bearer fake-access-token');
    expect(authHeader(requestOf(fetchMock, 1).init)).toBe('Bearer fake-refreshed-token');
    expect(hostCalls.refresh).toBe(1);
    expect(hostCalls.updates).toEqual([
      { ACCESS_TOKEN: 'fake-refreshed-token', EXPIRY_DATE: '2099-01-02T00:00:00.000Z' },
    ]);
  });

  it('asks to reconnect when the token is still rejected after a refresh', async () => {
    mockFetch(jsonResponse({}, 401), jsonResponse({}, 401));
    const result = await callTool('get-channel-report', {});
    expect(result.success).toBe(false);
    const message = JSON.stringify(result.error);
    expect(message).toContain('[AUTH_EXPIRED]');
    expect(message).toContain('agentapps <alias> auth');
    expect(hostCalls.refresh).toBe(1);
  });

  it('asks to reconnect when the host cannot refresh (dead refresh token)', async () => {
    setRefreshReply({ error: 'Token refresh failed: 400 invalid_grant' });
    mockFetch(jsonResponse({}, 401));
    const result = await callTool('list-channels', {});
    expect(result.success).toBe(false);
    const message = JSON.stringify(result.error);
    expect(message).toContain('[AUTH_EXPIRED]');
    expect(message).toContain('refresh token is no longer valid');
    expect(message).not.toContain('invalid_grant');
  });

  it('points at the OAuth client config when the host has no client secret', async () => {
    setRefreshReply({ error: 'Missing system secret: CLIENT_SECRET' });
    mockFetch(jsonResponse({}, 401));
    const result = await callTool('list-channels', {});
    expect(JSON.stringify(result.error)).toContain(
      'agentapps config app.youtube-analytics CLIENT_ID:<id> CLIENT_SECRET:<secret>',
    );
  });

  it('does not try to refresh without a refresh token', async () => {
    delete installationSecrets.REFRESH_TOKEN;
    mockFetch(jsonResponse({}, 401));
    const result = await callTool('list-channels', {});
    expect(JSON.stringify(result.error)).toContain('no refresh token');
    expect(hostCalls.refresh).toBe(0);
  });

  it('fails before any request when no account is connected', async () => {
    delete installationSecrets.ACCESS_TOKEN;
    const fetchMock = mockFetch();
    const result = await callTool('list-channels', {});
    expect(JSON.stringify(result.error)).toContain('[AUTH_REQUIRED]');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never puts a secret value in an error message', async () => {
    mockFetch(jsonResponse({}, 401), jsonResponse({}, 401));
    const result = await callTool('list-channels', {});
    expect(result.success).toBe(false);
    for (const value of ['fake-access-token', 'fake-refresh-token', 'fake-refreshed-token']) {
      expect(JSON.stringify(result)).not.toContain(value);
    }
  });
});

describe('client: errors and retries', () => {
  it('retries a GET on 503 and returns the second answer', async () => {
    const fetchMock = mockFetch(
      jsonResponse({}, 503, { 'Retry-After': '0' }),
      jsonResponse(totalsTable),
    );
    const result = await callTool('get-channel-report', {});
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after 3 attempts on repeated 503', async () => {
    const fetchMock = mockFetch(
      jsonResponse({}, 503, { 'Retry-After': '0' }),
      jsonResponse({}, 503, { 'Retry-After': '0' }),
      jsonResponse({}, 503, { 'Retry-After': '0' }),
    );
    const result = await callTool('get-channel-report', {});
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result.error)).toContain('503');
  });

  it('turns a long Retry-After into a RATE_LIMITED error instead of waiting', async () => {
    const fetchMock = mockFetch(
      jsonResponse(googleError(429, 'Too many requests', 'rateLimitExceeded'), 429, {
        'Retry-After': '120',
      }),
    );
    const result = await callTool('get-channel-report', {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.error)).toContain('[RATE_LIMITED]');
  });

  it('reports a used-up daily quota with plain text', async () => {
    mockFetch(
      jsonResponse(
        googleError(
          403,
          'The request cannot be completed because you have exceeded your <a href="/youtube/v3/getting-started#quota">quota</a>.',
          'quotaExceeded',
        ),
        403,
      ),
    );
    const result = await callTool('list-channels', {});
    const message = String((result.error as { message: string }).message);
    expect(message).toContain('[QUOTA_EXCEEDED]');
    expect(message).toContain('exceeded your quota.');
    expect(message).not.toContain('<a');
  });

  it('explains a 403 on a channel the account does not own', async () => {
    mockFetch(jsonResponse(googleError(403, 'Forbidden', 'forbidden', 'PERMISSION_DENIED'), 403));
    const result = await callTool('get-channel-report', { channelId: 'UCzzzzzzzzzzzzzzzzzzzzzz' });
    const message = JSON.stringify(result.error);
    expect(message).toContain('[FORBIDDEN]');
    expect(message).toContain('list-channels');
  });

  it('passes the API reason through for an unsupported query', async () => {
    mockFetch(
      jsonResponse(
        googleError(
          400,
          'The query is not supported. Check the documentation at https://developers.google.com/youtube/analytics/v2/available_reports for a list of supported queries.',
          'badRequest',
          'INVALID_ARGUMENT',
        ),
        400,
      ),
    );
    const result = await callTool('run-report', { metrics: ['views'], dimensions: ['video'] });
    const message = JSON.stringify(result.error);
    expect(message).toContain('[BAD_REQUEST]');
    expect(message).toContain('The query is not supported');
  });

  it('caps a long non-JSON error body', async () => {
    mockFetch(
      new Response('<html>'.padEnd(10_000, 'x'), { status: 500, statusText: 'Server Error' }),
    );
    const result = await callTool('list-channels', {});
    expect(result.success).toBe(false);
    const message = JSON.stringify(result.error);
    expect(message).toContain('500');
    expect(message.length).toBeLessThan(3_000);
  });

  it('names the host and the cause when the network fails', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(() =>
      Promise.reject(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }),
      ),
    );
    const result = await callTool('list-channels', {});
    const message = JSON.stringify(result.error);
    expect(message).toContain('[YOUTUBE_UNREACHABLE]');
    expect(message).toContain('www.googleapis.com');
    expect(message).toContain('ECONNRESET');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
