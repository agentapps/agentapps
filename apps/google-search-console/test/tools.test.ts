/**
 * Tool, client and health tests for the Google Search Console Agent App. The API is mocked (fetch).
 *
 * Mock bodies follow the real response shapes from the Search Console discovery document
 * and API reference, with synthetic values: int64 counts stay strings (sitemap errors,
 * warnings, submitted), metrics stay doubles, empty results omit `rows`, and PUT/DELETE
 * answer 204 with no body.
 */

import { describe, expect, it } from 'vitest';
import { defaultEndDate } from '../src/lib/args.js';
import { BASE_URL, REQUIRED_SCOPE } from '../src/lib/client.js';
import {
  callTool,
  installationSecrets,
  jsonResponse,
  type Message,
  mockFetch,
  refresh,
  requestOf,
  runHealthCheck,
  systemSecrets,
} from './harness.js';

const DOMAIN = 'sc-domain:example.com';
const DOMAIN_PATH = '/webmasters/v3/sites/sc-domain%3Aexample.com';
const PREFIX = 'https://www.example.com/';
const PREFIX_PATH = '/webmasters/v3/sites/https%3A%2F%2Fwww.example.com%2F';

const noContent = () => new Response(null, { status: 204, statusText: 'No Content' });

/** A Google API error body, shaped like the real ones (v3 `errors[]` plus ErrorInfo `details[]`). */
function googleError(code: number, status: string, message: string, reason?: string): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
        errors: [{ message, domain: 'global', reason: reason ?? 'forbidden' }],
        status,
        ...(reason
          ? {
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                  reason,
                  domain: 'googleapis.com',
                },
              ],
            }
          : {}),
      },
    },
    code,
  );
}

const errorText = (result: Message) => String((result.error as { message?: string })?.message);
const bodyOf = (fetchMock: ReturnType<typeof mockFetch>, n = 0) =>
  JSON.parse(String(requestOf(fetchMock, n).init.body));
const authHeader = (fetchMock: ReturnType<typeof mockFetch>, n = 0) =>
  (requestOf(fetchMock, n).init.headers as Record<string, string>).Authorization;

function analyticsRow(keys: string[], clicks: number, impressions: number, position: number) {
  return { keys, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
}

describe('health', () => {
  it('reports ready with the property count when the token works', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ siteEntry: [{ siteUrl: DOMAIN, permissionLevel: 'siteOwner' }] }),
    );
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    expect(String(health.message)).toContain('1 property');
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${BASE_URL}/webmasters/v3/sites`);
    expect(init.method).toBe('GET');
    expect(authHeader(fetchMock)).toBe('Bearer fake-access-token');
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
    expect(String(health.message)).toContain(new URL(BASE_URL).host);
  });

  it('reports not_ready with MISSING_SECRET when no account is connected', async () => {
    for (const key of Object.keys(installationSecrets)) delete installationSecrets[key];
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(JSON.stringify(health.issues)).toContain('MISSING_SECRET');
    expect(String(health.message)).toContain('auth');
  });

  it('reports not_ready with AUTH_EXPIRED when Google refuses the token', async () => {
    mockFetch(
      googleError(
        403,
        'PERMISSION_DENIED',
        'Request had insufficient authentication scopes.',
        'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
      ),
    );
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(JSON.stringify(health.issues)).toContain('AUTH_EXPIRED');
  });
});

describe('client', () => {
  it('fails with AUTH_REQUIRED and no request when no account is connected', async () => {
    delete installationSecrets.ACCESS_TOKEN;
    const fetchMock = mockFetch();
    const result = await callTool('list-sites', {});
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[AUTH_REQUIRED]');
    expect(errorText(result)).toContain('agentapps <alias> auth');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a GET once on 503 and returns the second answer', async () => {
    const fetchMock = mockFetch(
      jsonResponse({}, 503, { 'Retry-After': '0' }),
      jsonResponse({ siteEntry: [] }),
    );
    const result = await callTool('list-sites', {});
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries a POST that got a response', async () => {
    const fetchMock = mockFetch(
      jsonResponse({}, 503, { 'Retry-After': '0' }),
      jsonResponse({ rows: [] }),
    );
    const result = await callTool('query-search-analytics', { siteUrl: DOMAIN });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('503');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token once on 401 and replays the request, POST included', async () => {
    const fetchMock = mockFetch(
      googleError(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.'),
      jsonResponse({ rows: [analyticsRow([], 10, 100, 4.2)] }),
    );
    const result = await callTool('query-search-analytics', { siteUrl: DOMAIN });
    expect(result.success).toBe(true);
    expect(refresh.calls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeader(fetchMock, 0)).toBe('Bearer fake-access-token');
    expect(authHeader(fetchMock, 1)).toBe('Bearer fake-refreshed-access-token');
    expect(bodyOf(fetchMock, 1)).toEqual(bodyOf(fetchMock, 0));
  });

  it('asks to reconnect when the refresh fails', async () => {
    refresh.next = null;
    const fetchMock = mockFetch(
      googleError(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.'),
    );
    const result = await callTool('list-sites', {});
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[AUTH_EXPIRED]');
    expect(errorText(result)).toContain('auth reauth');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('points at agentapps config when the OAuth client is not configured', async () => {
    refresh.next = null;
    delete systemSecrets.CLIENT_SECRET;
    mockFetch(
      googleError(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.'),
    );
    const result = await callTool('list-sites', {});
    expect(errorText(result)).toContain('[SYSTEM_CONFIG_MISSING]');
    expect(errorText(result)).toContain('agentapps config app.google.search-console');
  });

  it('gives up after one refresh when Google still answers 401', async () => {
    const fetchMock = mockFetch(
      googleError(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.'),
      googleError(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.'),
    );
    const result = await callTool('list-sites', {});
    expect(errorText(result)).toContain('[AUTH_EXPIRED]');
    expect(refresh.calls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('names the missing scope on a scope 403', async () => {
    mockFetch(
      googleError(
        403,
        'PERMISSION_DENIED',
        'Request had insufficient authentication scopes.',
        'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
      ),
    );
    const result = await callTool('submit-sitemap', {
      siteUrl: DOMAIN,
      sitemapUrl: 'https://example.com/sitemap.xml',
    });
    expect(errorText(result)).toContain('[INSUFFICIENT_SCOPE]');
    expect(errorText(result)).toContain(REQUIRED_SCOPE);
  });

  it('says to enable the API when it is disabled in the Cloud project', async () => {
    mockFetch(
      googleError(
        403,
        'PERMISSION_DENIED',
        'Google Search Console API has not been used in project 123456789012 before or it is disabled.',
        'SERVICE_DISABLED',
      ),
    );
    const result = await callTool('list-sites', {});
    expect(errorText(result)).toContain('[API_DISABLED]');
    expect(errorText(result)).toContain('Google Search Console API');
  });

  it('explains a property permission 403 and points at list-sites', async () => {
    mockFetch(
      googleError(
        403,
        'PERMISSION_DENIED',
        "User does not have sufficient permission for site 'https://www.example.com/'. See also: https://support.google.com/webmasters/answer/2451999.",
      ),
    );
    const result = await callTool('get-top-queries', { siteUrl: PREFIX });
    expect(errorText(result)).toContain('[FORBIDDEN]');
    expect(errorText(result)).toContain('list-sites');
  });

  it('reports 429 as RATE_LIMITED', async () => {
    mockFetch(googleError(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded.', 'RATE_LIMIT_EXCEEDED'));
    const result = await callTool('inspect-url', { siteUrl: DOMAIN, url: 'https://example.com/' });
    expect(errorText(result)).toContain('[RATE_LIMITED]');
  });

  it('names the host when a POST cannot reach the API', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(() =>
      Promise.reject(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }),
      ),
    );
    const result = await callTool('inspect-url', { siteUrl: DOMAIN, url: 'https://example.com/' });
    expect(errorText(result)).toContain('[GOOGLE_SEARCH_CONSOLE_UNREACHABLE]');
    expect(errorText(result)).toContain('searchconsole.googleapis.com');
    expect(errorText(result)).toContain('ECONNRESET');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps a long error body and reports the status', async () => {
    mockFetch(
      new Response('<html>'.padEnd(10_000, 'x'), { status: 500, statusText: 'Server Error' }),
    );
    const result = await callTool('get-sitemap', {
      siteUrl: DOMAIN,
      sitemapUrl: 'https://example.com/sitemap.xml',
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('500');
    expect(errorText(result).length).toBeLessThan(3_000);
  });

  it('never puts a secret value in an error message', async () => {
    refresh.next = null;
    mockFetch(
      googleError(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.'),
    );
    const result = await callTool('list-sites', {});
    expect(result.success).toBe(false);
    for (const value of [...Object.values(installationSecrets), ...Object.values(systemSecrets)]) {
      expect(JSON.stringify(result)).not.toContain(value);
    }
  });
});

describe('argument checks (no request is sent)', () => {
  const rejects = async (tool: string, args: Record<string, unknown>, text: string) => {
    const fetchMock = mockFetch();
    const result = await callTool(tool, args);
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[BAD_REQUEST]');
    expect(errorText(result)).toContain(text);
    expect(fetchMock).not.toHaveBeenCalled();
  };

  it('requires a siteUrl in a known form', async () => {
    await rejects('get-top-pages', {}, 'siteUrl is required');
    await rejects('get-top-pages', { siteUrl: 'example.com' }, 'not a URL');
    await rejects('get-top-pages', { siteUrl: 'ftp://example.com/' }, 'http');
    await rejects('get-top-pages', { siteUrl: 'sc-domain:exa mple' }, 'Domain property');
    await rejects('delete-site', { siteUrl: 'https://example.com/?x=1' }, '? or #');
  });

  it('rejects bad dates, ranges and limits', async () => {
    await rejects(
      'query-search-analytics',
      { siteUrl: DOMAIN, startDate: '2026-02-30' },
      'YYYY-MM-DD',
    );
    await rejects(
      'query-search-analytics',
      { siteUrl: DOMAIN, startDate: '2026-05-10', endDate: '2026-05-01' },
      'after endDate',
    );
    await rejects(
      'query-search-analytics',
      { siteUrl: DOMAIN, startDate: '2024-01-01', endDate: '2026-01-01' },
      'longer than',
    );
    await rejects('query-search-analytics', { siteUrl: DOMAIN, rowLimit: 6000 }, 'rowLimit');
    await rejects('get-top-queries', { siteUrl: DOMAIN, limit: 0 }, 'limit');
  });

  it('rejects unknown dimensions, repeated dimensions and bad filters', async () => {
    await rejects(
      'query-search-analytics',
      { siteUrl: DOMAIN, dimensions: ['keyword'] },
      'dimensions[0]',
    );
    await rejects(
      'query-search-analytics',
      { siteUrl: DOMAIN, dimensions: ['page', 'page'] },
      'repeat',
    );
    await rejects(
      'query-search-analytics',
      {
        siteUrl: DOMAIN,
        filters: [{ dimension: 'page', operator: 'startsWith', expression: '/' }],
      },
      'operator',
    );
    await rejects(
      'query-search-analytics',
      { siteUrl: DOMAIN, filters: [{ dimension: 'date', expression: '2026-01-01' }] },
      'dimension',
    );
    await rejects('get-top-pages', { siteUrl: DOMAIN, country: 'es' }, 'alpha-3');
    await rejects('get-top-pages', { siteUrl: DOMAIN, device: 'PHONE' }, 'device');
  });

  it('requires absolute http(s) URLs for pages and sitemaps', async () => {
    await rejects('inspect-url', { siteUrl: DOMAIN, url: '/blog/post' }, 'absolute URL');
    await rejects('submit-sitemap', { siteUrl: DOMAIN, sitemapUrl: 'sitemap.xml' }, 'absolute URL');
    await rejects('delete-sitemap', { siteUrl: DOMAIN }, 'sitemapUrl is required');
  });
});

describe('list-sites', () => {
  it('lists, sorts, filters and pages the properties', async () => {
    const siteEntry = [
      { siteUrl: 'https://www.example.com/', permissionLevel: 'siteOwner' },
      { siteUrl: 'sc-domain:example.org', permissionLevel: 'siteFullUser' },
      { siteUrl: 'sc-domain:example.com', permissionLevel: 'siteUnverifiedUser' },
    ];
    const fetchMock = mockFetch(jsonResponse({ siteEntry }));
    const result = await callTool('list-sites', { contains: 'SC-DOMAIN', limit: 1 });
    expect(requestOf(fetchMock).url.pathname).toBe('/webmasters/v3/sites');
    expect(result.result).toEqual({
      sites: [{ siteUrl: 'sc-domain:example.com', permissionLevel: 'siteUnverifiedUser' }],
      total: 2,
      hasMore: true,
      nextOffset: 1,
    });
  });

  it('returns an empty list when the account has no properties (no siteEntry key)', async () => {
    mockFetch(jsonResponse({}));
    const result = await callTool('list-sites', {});
    expect(result.result).toEqual({ sites: [], total: 0, hasMore: false });
  });
});

describe('query-search-analytics', () => {
  it('sends the full request and returns rows as columns', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        rows: [
          analyticsRow(['running shoes', 'MOBILE'], 120, 3400, 7.123456),
          analyticsRow(['trail shoes', 'DESKTOP'], 0, 15, 41.5),
        ],
        responseAggregationType: 'byProperty',
      }),
    );
    const result = await callTool('query-search-analytics', {
      siteUrl: DOMAIN,
      startDate: '2026-09-01',
      endDate: '2026-09-28',
      dimensions: ['query', 'device'],
      type: 'web',
      filters: [
        { dimension: 'country', operator: 'equals', expression: 'esp' },
        { dimension: 'page', operator: 'contains', expression: '/blog/' },
      ],
      rowLimit: 2,
      startRow: 10,
    });
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('POST');
    expect(url.toString()).toBe(`${BASE_URL}${DOMAIN_PATH}/searchAnalytics/query`);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(bodyOf(fetchMock)).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-28',
      dimensions: ['query', 'device'],
      type: 'web',
      dataState: 'final',
      rowLimit: 2,
      startRow: 10,
      dimensionFilterGroups: [
        {
          groupType: 'and',
          filters: [
            { dimension: 'country', operator: 'equals', expression: 'esp' },
            { dimension: 'page', operator: 'contains', expression: '/blog/' },
          ],
        },
      ],
    });
    expect(result.result).toEqual({
      siteUrl: DOMAIN,
      startDate: '2026-09-01',
      endDate: '2026-09-28',
      type: 'web',
      dataState: 'final',
      columns: ['query', 'device', 'clicks', 'impressions', 'ctr', 'position'],
      rows: [
        ['running shoes', 'MOBILE', 120, 3400, 0.0353, 7.12],
        ['trail shoes', 'DESKTOP', 0, 15, 0, 41.5],
      ],
      rowCount: 2,
      startRow: 10,
      hasMore: true,
      nextStartRow: 12,
      responseAggregationType: 'byProperty',
    });
  });

  it('adds the trailing slash to a bare URL-prefix origin and encodes it in the path', async () => {
    const fetchMock = mockFetch(jsonResponse({ responseAggregationType: 'auto' }));
    const result = await callTool('query-search-analytics', {
      siteUrl: 'https://www.example.com',
      endDate: '2026-09-28',
      days: 7,
    });
    expect(requestOf(fetchMock).url.pathname).toBe(`${PREFIX_PATH}/searchAnalytics/query`);
    expect(bodyOf(fetchMock)).toMatchObject({ startDate: '2026-09-22', endDate: '2026-09-28' });
    // No `rows` key at all when nothing matched.
    expect(result.result).toMatchObject({ siteUrl: PREFIX, rows: [], rowCount: 0, hasMore: false });
  });

  it('uses hourly_all for the hour dimension and reports the first incomplete hour', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        rows: [analyticsRow(['2026-10-15T09:00:00-07:00'], 3, 40, 5)],
        responseAggregationType: 'byProperty',
        metadata: { first_incomplete_hour: '2026-10-15T09:00:00-07:00' },
      }),
    );
    const result = await callTool('query-search-analytics', {
      siteUrl: DOMAIN,
      startDate: '2026-10-14',
      endDate: '2026-10-15',
      dimensions: 'hour',
    });
    expect(bodyOf(fetchMock).dataState).toBe('hourly_all');
    expect(result.result).toMatchObject({ firstIncompleteHour: '2026-10-15T09:00:00-07:00' });
  });

  it('keeps an oversized answer under 50,000 characters with a working cursor', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) =>
      analyticsRow(
        [`https://www.example.com/${'long-path-segment/'.repeat(4)}${i}`],
        2000 - i,
        5000,
        3,
      ),
    );
    mockFetch(jsonResponse({ rows, responseAggregationType: 'byPage' }));
    const result = await callTool('query-search-analytics', {
      siteUrl: DOMAIN,
      dimensions: ['page'],
      rowLimit: 2000,
    });
    const out = result.result as { rowCount: number; nextStartRow: number; limitApplied: boolean };
    expect(JSON.stringify(out).length).toBeLessThan(50_000);
    expect(out.limitApplied).toBe(true);
    expect(out.rowCount).toBeGreaterThan(100);
    expect(out.nextStartRow).toBe(out.rowCount);
  });
});

describe('get-top-queries / get-top-pages', () => {
  it('builds the top-queries request from the shortcuts', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        rows: [analyticsRow(['zapatillas running'], 50, 900, 6.5)],
        responseAggregationType: 'byPage',
      }),
    );
    const result = await callTool('get-top-queries', {
      siteUrl: PREFIX,
      endDate: '2026-10-10',
      days: 28,
      limit: 10,
      page: 'https://www.example.com/shoes/',
      queryContains: 'running',
      country: 'ESP',
      device: 'mobile',
    });
    expect(requestOf(fetchMock).url.pathname).toBe(`${PREFIX_PATH}/searchAnalytics/query`);
    expect(bodyOf(fetchMock)).toEqual({
      startDate: '2026-09-13',
      endDate: '2026-10-10',
      dimensions: ['query'],
      type: 'web',
      rowLimit: 10,
      dimensionFilterGroups: [
        {
          groupType: 'and',
          filters: [
            { dimension: 'country', operator: 'equals', expression: 'esp' },
            { dimension: 'device', operator: 'equals', expression: 'MOBILE' },
            { dimension: 'query', operator: 'contains', expression: 'running' },
            { dimension: 'page', operator: 'equals', expression: 'https://www.example.com/shoes/' },
          ],
        },
      ],
    });
    expect(result.result).toEqual({
      siteUrl: PREFIX,
      startDate: '2026-09-13',
      endDate: '2026-10-10',
      type: 'web',
      items: [
        { query: 'zapatillas running', clicks: 50, impressions: 900, ctr: 0.0556, position: 6.5 },
      ],
    });
  });

  it('returns top pages, optionally for one query', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ rows: [analyticsRow(['https://example.com/a'], 9, 90, 2)] }),
    );
    const result = await callTool('get-top-pages', {
      siteUrl: DOMAIN,
      query: 'Example Brand',
      type: 'image',
    });
    const body = bodyOf(fetchMock);
    expect(body.dimensions).toEqual(['page']);
    expect(body.type).toBe('image');
    expect(body.rowLimit).toBe(25);
    expect(body.dimensionFilterGroups[0].filters).toEqual([
      { dimension: 'query', operator: 'equals', expression: 'Example Brand' },
    ]);
    expect((result.result as { items: unknown[] }).items).toEqual([
      { page: 'https://example.com/a', clicks: 9, impressions: 90, ctr: 0.1, position: 2 },
    ]);
  });
});

describe('compare-periods', () => {
  it('compares with the previous period and sorts by the biggest click change', async () => {
    const fetchMock = mockFetch(
      // current, grouped
      jsonResponse({
        rows: [
          analyticsRow(['shoes'], 100, 1000, 3),
          analyticsRow(['boots'], 40, 500, 5),
          analyticsRow(['new term'], 5, 50, 8),
        ],
      }),
      // previous, grouped
      jsonResponse({
        rows: [
          analyticsRow(['shoes'], 160, 1200, 2),
          analyticsRow(['boots'], 38, 480, 5.5),
          analyticsRow(['lost term'], 20, 100, 4),
        ],
      }),
      // totals
      jsonResponse({ rows: [analyticsRow([], 145, 1550, 4)] }),
      jsonResponse({ rows: [analyticsRow([], 218, 1780, 3)] }),
    );
    const result = await callTool('compare-periods', {
      siteUrl: DOMAIN,
      startDate: '2026-09-15',
      endDate: '2026-09-28',
      limit: 3,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const bodies = [0, 1, 2, 3].map((n) => bodyOf(fetchMock, n));
    expect(bodies[0]).toMatchObject({
      startDate: '2026-09-15',
      endDate: '2026-09-28',
      dimensions: ['query'],
      rowLimit: 5000,
    });
    expect(bodies[1]).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-14' });
    expect(bodies[2]).toEqual({ startDate: '2026-09-15', endDate: '2026-09-28', type: 'web' });
    expect(bodies[3]).toEqual({ startDate: '2026-09-01', endDate: '2026-09-14', type: 'web' });

    const out = result.result as {
      current: Record<string, unknown>;
      previous: Record<string, unknown>;
      items: Array<Record<string, unknown>>;
    };
    expect(out.current).toMatchObject({ startDate: '2026-09-15', clicks: 145 });
    expect(out.previous).toMatchObject({ endDate: '2026-09-14', clicks: 218 });
    expect(out.items.map((i) => i.key)).toEqual(['shoes', 'lost term', 'new term']);
    expect(out.items[0]).toEqual({
      key: 'shoes',
      clicks: 100,
      previousClicks: 160,
      clicksChange: -60,
      impressions: 1000,
      previousImpressions: 1200,
      impressionsChange: -200,
      ctr: 0.1,
      previousCtr: 0.1333,
      position: 3,
      previousPosition: 2,
      positionChange: 1,
    });
    // A key missing from one period has no position change.
    expect(out.items[1]).toMatchObject({ clicks: 0, previousClicks: 20, positionChange: null });
  });

  it('compares 52 weeks back and keeps only gains when asked', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ rows: [analyticsRow(['https://example.com/a'], 30, 300, 4)] }),
      jsonResponse({ rows: [analyticsRow(['https://example.com/a'], 10, 200, 6)] }),
      jsonResponse({ rows: [analyticsRow([], 30, 300, 4)] }),
      jsonResponse({}),
    );
    const result = await callTool('compare-periods', {
      siteUrl: DOMAIN,
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      dimension: 'page',
      compareTo: 'previous_year',
      sortBy: 'gains',
    });
    expect(bodyOf(fetchMock, 1)).toMatchObject({
      startDate: '2025-09-02',
      endDate: '2025-09-08',
      dimensions: ['page'],
    });
    const out = result.result as { previous: Record<string, unknown>; items: unknown[] };
    expect(out.previous).toMatchObject({ clicks: 0, impressions: 0 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ clicksChange: 20, positionChange: -2 });
  });
});

describe('inspect-url', () => {
  it('posts the inspection and curates the result', async () => {
    const referringUrls = Array.from({ length: 25 }, (_, i) => `https://example.com/ref-${i}`);
    const fetchMock = mockFetch(
      jsonResponse({
        inspectionResult: {
          inspectionResultLink:
            'https://search.google.com/search-console/inspect?resource_id=sc-domain:example.com&id=abc',
          indexStatusResult: {
            sitemap: ['https://example.com/sitemap.xml'],
            referringUrls,
            verdict: 'PASS',
            coverageState: 'Submitted and indexed',
            robotsTxtState: 'ALLOWED',
            indexingState: 'INDEXING_ALLOWED',
            lastCrawlTime: '2026-10-01T08:15:30Z',
            pageFetchState: 'SUCCESSFUL',
            googleCanonical: 'https://example.com/shoes/',
            userCanonical: 'https://example.com/shoes/',
            crawledAs: 'MOBILE',
          },
          mobileUsabilityResult: { verdict: 'VERDICT_UNSPECIFIED' },
          richResultsResult: {
            verdict: 'PASS',
            detectedItems: [
              {
                richResultType: 'Product snippets',
                items: [
                  {
                    name: 'Running shoe',
                    issues: [{ issueMessage: 'Missing field "review"', severity: 'WARNING' }],
                  },
                  {
                    name: 'Trail shoe',
                    issues: [{ issueMessage: 'Missing field "review"', severity: 'WARNING' }],
                  },
                ],
              },
            ],
          },
        },
      }),
    );
    const result = await callTool('inspect-url', {
      siteUrl: DOMAIN,
      url: 'https://example.com/shoes/',
      languageCode: 'es-ES',
    });
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('POST');
    expect(url.toString()).toBe(`${BASE_URL}/v1/urlInspection/index:inspect`);
    expect(bodyOf(fetchMock)).toEqual({
      inspectionUrl: 'https://example.com/shoes/',
      siteUrl: DOMAIN,
      languageCode: 'es-ES',
    });
    const out = result.result as Record<string, unknown>;
    expect(out).toMatchObject({
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
      pageFetchState: 'SUCCESSFUL',
      crawledAs: 'MOBILE',
      sitemaps: ['https://example.com/sitemap.xml'],
      referringUrlCount: 25,
      richResults: {
        verdict: 'PASS',
        types: [
          { type: 'Product snippets', items: 2, issues: ['WARNING: Missing field "review"'] },
        ],
      },
      mobileUsability: { verdict: 'VERDICT_UNSPECIFIED', issues: [] },
    });
    expect(out.referringUrls).toHaveLength(20);
    expect(out).not.toHaveProperty('amp');
  });

  it('returns nulls for a URL Google does not know', async () => {
    mockFetch(
      jsonResponse({
        inspectionResult: {
          inspectionResultLink: 'https://search.google.com/search-console/inspect?id=x',
          indexStatusResult: {
            verdict: 'NEUTRAL',
            coverageState: 'URL is unknown to Google',
            robotsTxtState: 'ROBOTS_TXT_STATE_UNSPECIFIED',
            indexingState: 'INDEXING_STATE_UNSPECIFIED',
            pageFetchState: 'PAGE_FETCH_STATE_UNSPECIFIED',
          },
        },
      }),
    );
    const result = await callTool('inspect-url', {
      siteUrl: DOMAIN,
      url: 'https://example.com/new',
    });
    expect(result.result).toMatchObject({
      verdict: 'NEUTRAL',
      lastCrawlTime: null,
      googleCanonical: null,
      sitemaps: [],
      referringUrls: [],
      referringUrlCount: 0,
    });
  });
});

const SITEMAP = {
  path: 'https://example.com/sitemap.xml',
  lastSubmitted: '2026-09-30T10:00:00.000Z',
  isPending: false,
  isSitemapsIndex: true,
  type: 'SITEMAP',
  lastDownloaded: '2026-10-12T04:20:00.000Z',
  warnings: '2',
  errors: '0',
  contents: [
    { type: 'web', submitted: '1520', indexed: '0' },
    { type: 'image', submitted: '310', indexed: '0' },
  ],
};

const CURATED_SITEMAP = {
  path: 'https://example.com/sitemap.xml',
  type: 'SITEMAP',
  isSitemapsIndex: true,
  isPending: false,
  lastSubmitted: '2026-09-30T10:00:00.000Z',
  lastDownloaded: '2026-10-12T04:20:00.000Z',
  errors: 0,
  warnings: 2,
  contents: [
    { type: 'web', submitted: 1520 },
    { type: 'image', submitted: 310 },
  ],
};

describe('sitemaps', () => {
  it('list-sitemaps turns int64 strings into numbers and pages', async () => {
    const second = { path: 'https://example.com/news.xml', isPending: true, errors: '3' };
    const fetchMock = mockFetch(jsonResponse({ sitemap: [SITEMAP, second] }));
    const result = await callTool('list-sitemaps', {
      siteUrl: DOMAIN,
      sitemapIndex: 'https://example.com/sitemap.xml',
      limit: 1,
    });
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('GET');
    expect(url.pathname).toBe(`${DOMAIN_PATH}/sitemaps`);
    expect(url.searchParams.get('sitemapIndex')).toBe('https://example.com/sitemap.xml');
    expect(result.result).toEqual({
      siteUrl: DOMAIN,
      sitemaps: [CURATED_SITEMAP],
      total: 2,
      hasMore: true,
      nextOffset: 1,
    });
  });

  it('list-sitemaps handles a property without sitemaps', async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    const result = await callTool('list-sitemaps', { siteUrl: PREFIX });
    expect(requestOf(fetchMock).url.search).toBe('');
    expect(result.result).toEqual({ siteUrl: PREFIX, sitemaps: [], total: 0, hasMore: false });
  });

  it('get-sitemap encodes the sitemap URL as one path segment', async () => {
    const fetchMock = mockFetch(jsonResponse(SITEMAP));
    const result = await callTool('get-sitemap', {
      siteUrl: DOMAIN,
      sitemapUrl: 'https://example.com/sitemap.xml',
    });
    expect(requestOf(fetchMock).url.pathname).toBe(
      `${DOMAIN_PATH}/sitemaps/https%3A%2F%2Fexample.com%2Fsitemap.xml`,
    );
    expect(result.result).toEqual({ siteUrl: DOMAIN, ...CURATED_SITEMAP });
  });

  it('get-sitemap reports NOT_FOUND for a sitemap that was never submitted', async () => {
    mockFetch(googleError(404, 'NOT_FOUND', 'Requested entity was not found.', 'notFound'));
    const result = await callTool('get-sitemap', {
      siteUrl: DOMAIN,
      sitemapUrl: 'https://example.com/missing.xml',
    });
    expect(errorText(result)).toContain('[NOT_FOUND]');
  });

  it('submit-sitemap PUTs the sitemap and returns a short summary', async () => {
    const fetchMock = mockFetch(noContent());
    const result = await callTool('submit-sitemap', {
      siteUrl: PREFIX,
      sitemapUrl: 'https://www.example.com/sitemap.xml',
    });
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('PUT');
    expect(init.body).toBeUndefined();
    expect(url.pathname).toBe(
      `${PREFIX_PATH}/sitemaps/https%3A%2F%2Fwww.example.com%2Fsitemap.xml`,
    );
    expect(result.result).toMatchObject({
      success: true,
      siteUrl: PREFIX,
      sitemapUrl: 'https://www.example.com/sitemap.xml',
    });
  });

  it('submit-sitemap retries a PUT on 503 (it is idempotent)', async () => {
    const fetchMock = mockFetch(jsonResponse({}, 503, { 'Retry-After': '0' }), noContent());
    const result = await callTool('submit-sitemap', {
      siteUrl: PREFIX,
      sitemapUrl: 'https://www.example.com/sitemap.xml',
    });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('delete-sitemap sends a DELETE for that sitemap', async () => {
    const fetchMock = mockFetch(noContent());
    const result = await callTool('delete-sitemap', {
      siteUrl: DOMAIN,
      sitemapUrl: 'https://example.com/old.xml',
    });
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('DELETE');
    expect(url.pathname).toBe(`${DOMAIN_PATH}/sitemaps/https%3A%2F%2Fexample.com%2Fold.xml`);
    expect(result.result).toEqual({
      success: true,
      siteUrl: DOMAIN,
      sitemapUrl: 'https://example.com/old.xml',
    });
  });
});

describe('sites', () => {
  it('add-site PUTs the property and reads back its permission level', async () => {
    const fetchMock = mockFetch(
      noContent(),
      jsonResponse({ siteUrl: DOMAIN, permissionLevel: 'siteUnverifiedUser' }),
    );
    const result = await callTool('add-site', { siteUrl: 'SC-DOMAIN:example.com' });
    expect(requestOf(fetchMock, 0).init.method).toBe('PUT');
    expect(requestOf(fetchMock, 0).url.pathname).toBe(DOMAIN_PATH);
    expect(requestOf(fetchMock, 1).init.method).toBe('GET');
    expect(result.result).toEqual({
      success: true,
      siteUrl: DOMAIN,
      permissionLevel: 'siteUnverifiedUser',
    });
  });

  it('add-site still succeeds when the read-back fails', async () => {
    mockFetch(noContent(), googleError(404, 'NOT_FOUND', 'Not found.', 'notFound'));
    const result = await callTool('add-site', { siteUrl: PREFIX });
    expect(result.result).toEqual({ success: true, siteUrl: PREFIX, permissionLevel: null });
  });

  it('delete-site sends a DELETE for that property only', async () => {
    const fetchMock = mockFetch(noContent());
    const result = await callTool('delete-site', { siteUrl: PREFIX });
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('DELETE');
    expect(url.pathname).toBe(PREFIX_PATH);
    expect(result.result).toEqual({ success: true, siteUrl: PREFIX });
  });

  it('delete-site reports a permission error instead of deleting something else', async () => {
    mockFetch(
      googleError(
        403,
        'PERMISSION_DENIED',
        "User does not have sufficient permission for site 'https://www.example.com/'.",
      ),
    );
    const result = await callTool('delete-site', { siteUrl: PREFIX });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[FORBIDDEN]');
  });
});

describe('default date range', () => {
  it('ends 3 days before today in Pacific Time', () => {
    // 2026-10-17 05:00 UTC is still 2026-10-16 in Los Angeles.
    expect(defaultEndDate(new Date('2026-10-17T05:00:00Z'))).toBe('2026-10-13');
    expect(defaultEndDate(new Date('2026-10-17T12:00:00Z'))).toBe('2026-10-14');
  });
});
