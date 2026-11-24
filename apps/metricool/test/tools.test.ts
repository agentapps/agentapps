/**
 * Tool, client and health tests for the Metricool Agent App. The API is mocked (fetch).
 *
 * No call was ever made against the real service: the mock bodies follow the schemas of
 * Metricool's OpenAPI document (https://app.metricool.com/api/swagger.json) with synthetic
 * values, keeping its types (numeric ids, the `data` envelope, nulls).
 */

import { describe, expect, it } from 'vitest';
import { BASE_URL } from '../src/lib/client.js';
import {
  callTool,
  installationSecrets,
  jsonResponse,
  mockFetch,
  requestOf,
  runHealthCheck,
} from './harness.js';

const BRANDS = {
  data: [
    {
      id: 123456,
      userId: 9001,
      ownerUserId: 9001,
      label: 'Example Co',
      title: null,
      timezone: 'Europe/Madrid',
      networksData: {
        webData: null,
        facebookData: null,
        instagramData: 'exampleco',
        twitterData: 'exampleco_x',
        linkedinData: 'urn:li:organization:42',
        tiktokData: '',
      },
      isShared: false,
      deleted: false,
    },
  ],
};

const POST = {
  id: 555001,
  publicationDate: { dateTime: '2026-12-01T09:00:00', timezone: 'Europe/Madrid' },
  creationDate: { dateTime: '2026-11-23T10:00:00', timezone: 'Europe/Madrid' },
  text: 'Launch day',
  firstCommentText: 'Link in bio',
  providers: [
    {
      network: 'linkedin',
      id: 'urn:li:share:1',
      status: 'PUBLISHED',
      publicUrl: 'https://www.linkedin.com/feed/update/urn:li:share:1',
    },
    { network: 'instagram', status: 'PENDING' },
  ],
  media: ['https://static.metricool.com/media/a.jpg'],
  autoPublish: true,
  draft: false,
  shortener: false,
  twitterData: null,
  instagramData: { type: 'POST', showReelOnFeed: true },
  smartLinkData: { ids: [] },
};

const BRAND = { brandId: 123456 };
const RANGE = {
  start: '2026-12-01T00:00:00',
  end: '2026-12-31T23:59:59',
  timezone: 'Europe/Madrid',
};
const NEW_POST = {
  ...BRAND,
  text: 'Launch day',
  date: '2026-12-01T09:00:00',
  timezone: 'Europe/Madrid',
  networks: ['linkedin', 'instagram'],
};

const bodyOf = (init: RequestInit) => JSON.parse(String(init.body));
const errorOf = (result: Record<string, unknown>) => JSON.stringify(result.error);
const queryOf = (url: URL) => Object.fromEntries(url.searchParams);

describe('health', () => {
  it('[METRICOOL-AC-2] is ready on a 200 from /v2/settings/brands', async () => {
    const fetchMock = mockFetch(jsonResponse(BRANDS));
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestOf(fetchMock).url.pathname).toBe('/api/v2/settings/brands');
  });

  it('[METRICOOL-AC-2] is not ready on a 401', async () => {
    mockFetch(jsonResponse({ message: 'Unauthorized' }, 401));
    const health = await runHealthCheck();
    expect(health.status).not.toBe('ready');
    expect(String(health.message)).toContain('[AUTH_REQUIRED]');
  });

  it('reports degraded and names the host when the API is unreachable', async () => {
    const down = () =>
      Promise.reject(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }),
      );
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(down);
    const health = await runHealthCheck();
    expect(health.status).toBe('degraded');
    expect(String(health.message)).toContain(new URL(BASE_URL).host);
  });

  it('reports not_ready with MISSING_SECRET when a secret is missing', async () => {
    for (const key of Object.keys(installationSecrets)) delete installationSecrets[key];
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(JSON.stringify(health.issues)).toContain('MISSING_SECRET');
  });
});

describe('client', () => {
  it('retries a GET once on 503 and returns the second answer', async () => {
    const fetchMock = mockFetch(
      jsonResponse({}, 503, { 'Retry-After': '0' }),
      jsonResponse(BRANDS),
    );
    const result = await callTool('list-brands', {});
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never sends a POST twice', async () => {
    const fetchMock = mockFetch(jsonResponse({}, 503, { 'Retry-After': '0' }));
    const result = await callTool('schedule-post', NEW_POST);
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps a long error body and reports the status', async () => {
    mockFetch(new Response('x'.repeat(10_000), { status: 500, statusText: 'Server Error' }));
    const result = await callTool('list-brands', {});
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('500');
    expect(errorOf(result).length).toBeLessThan(3_000);
  });

  it('never puts a secret value in an error message or in the URL', async () => {
    const token = installationSecrets.METRICOOL_USER_TOKEN;
    const fetchMock = mockFetch(jsonResponse({ error: 'unauthorized' }, 401));
    const result = await callTool('list-brands', {});
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(requestOf(fetchMock).url.href).not.toContain(token);
  });
});

describe('list-brands', () => {
  it('[METRICOOL-AC-1] sends the token in X-Mc-Auth and userId in the query, and returns the curated brands', async () => {
    const fetchMock = mockFetch(jsonResponse(BRANDS));
    const result = await callTool('list-brands', {});
    expect(result.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(`${url.origin}${url.pathname}`).toBe('https://app.metricool.com/api/v2/settings/brands');
    expect(queryOf(url)).toEqual({ userId: installationSecrets.METRICOOL_USER_ID });
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['X-Mc-Auth']).toBe(
      installationSecrets.METRICOOL_USER_TOKEN,
    );
    expect(result.result).toEqual({
      brands: [
        {
          id: 123456,
          label: 'Example Co',
          timezone: 'Europe/Madrid',
          networks: [
            { network: 'instagram', handle: 'exampleco' },
            { network: 'twitter', handle: 'exampleco_x' },
            { network: 'linkedin', handle: 'urn:li:organization:42' },
          ],
        },
      ],
    });
  });
});

describe('list-posts', () => {
  it('[METRICOOL-AC-3] sends blogId, start, end and timezone and returns the curated fields', async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [POST] }));
    const result = await callTool('list-posts', { ...BRAND, ...RANGE });
    expect(result.success).toBe(true);
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/api/v2/scheduler/posts');
    expect(queryOf(url)).toEqual({
      blogId: '123456',
      start: RANGE.start,
      end: RANGE.end,
      timezone: 'Europe/Madrid',
      userId: installationSecrets.METRICOOL_USER_ID,
    });
    expect(result.result).toEqual({
      posts: [
        {
          id: 555001,
          date: '2026-12-01T09:00:00',
          timezone: 'Europe/Madrid',
          draft: false,
          preview: 'Launch day',
          networks: [
            {
              network: 'linkedin',
              status: 'PUBLISHED',
              publicUrl: 'https://www.linkedin.com/feed/update/urn:li:share:1',
            },
            { network: 'instagram', status: 'PENDING', publicUrl: null },
          ],
        },
      ],
    });
  });

  it('[METRICOOL-AC-3] cuts an oversized answer with limitApplied', async () => {
    const many = Array.from({ length: 400 }, (_, i) => ({
      ...POST,
      id: i + 1,
      text: 'x'.repeat(400),
    }));
    mockFetch(jsonResponse({ data: many }));
    const result = await callTool('list-posts', { ...BRAND, ...RANGE });
    expect(result.success).toBe(true);
    const answer = result.result as { posts: unknown[]; limitApplied?: boolean; message?: string };
    expect(answer.limitApplied).toBe(true);
    expect(answer.posts.length).toBeLessThan(400);
    expect(answer.posts.length).toBeGreaterThan(0);
    expect(JSON.stringify(answer).length).toBeLessThan(50_000);
    expect(answer.message).toContain('Narrow the date range');
  });
});

describe('get-post', () => {
  it('[METRICOOL-AC-4] requests the post and returns the full text, first comment, media and set network data', async () => {
    const fetchMock = mockFetch(jsonResponse({ data: POST }));
    const result = await callTool('get-post', { ...BRAND, id: '555001' });
    expect(result.success).toBe(true);
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/api/v2/scheduler/posts/555001');
    expect(url.searchParams.get('blogId')).toBe('123456');
    expect(result.result).toMatchObject({
      id: 555001,
      text: 'Launch day',
      firstComment: 'Link in bio',
      media: ['https://static.metricool.com/media/a.jpg'],
      networkData: { instagramData: { type: 'POST', showReelOnFeed: true } },
    });
  });
});

describe('schedule-post and create-draft', () => {
  it('[METRICOOL-AC-5] schedule-post posts draft false, autoPublish true, the date and the providers', async () => {
    const fetchMock = mockFetch(jsonResponse({ data: POST }));
    const result = await callTool('schedule-post', {
      ...NEW_POST,
      media: ['https://example.com/a.jpg'],
      firstComment: 'Link in bio',
      networkData: { instagramData: { type: 'POST' } },
    });
    expect(result.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('POST');
    expect(url.pathname).toBe('/api/v2/scheduler/posts');
    expect(url.searchParams.get('blogId')).toBe('123456');
    expect(bodyOf(init)).toEqual({
      text: 'Launch day',
      publicationDate: { dateTime: '2026-12-01T09:00:00', timezone: 'Europe/Madrid' },
      providers: [{ network: 'linkedin' }, { network: 'instagram' }],
      autoPublish: true,
      draft: false,
      media: ['https://example.com/a.jpg'],
      firstCommentText: 'Link in bio',
      instagramData: { type: 'POST' },
    });
    expect(result.result).toEqual({
      success: true,
      id: 555001,
      date: '2026-12-01T09:00:00',
      timezone: 'Europe/Madrid',
      networks: ['linkedin', 'instagram'],
    });
  });

  it('[METRICOOL-AC-5] create-draft posts draft true and autoPublish false', async () => {
    const fetchMock = mockFetch(jsonResponse({ data: { ...POST, draft: true } }));
    const result = await callTool('create-draft', NEW_POST);
    expect(result.success).toBe(true);
    const body = bodyOf(requestOf(fetchMock).init);
    expect(body.draft).toBe(true);
    expect(body.autoPublish).toBe(false);
    expect(result.result).toMatchObject({ success: true, id: 555001 });
  });

  it('refuses a networkData key that is not a network data object, before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('schedule-post', { ...NEW_POST, networkData: { draft: true } });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[METRICOOL-AC-6] refuses 281 characters on twitter and 301 on bluesky, before any request', async () => {
    const fetchMock = mockFetch();
    const x = await callTool('schedule-post', {
      ...NEW_POST,
      networks: ['twitter'],
      text: 'a'.repeat(281),
    });
    expect(x.success).toBe(false);
    expect(errorOf(x)).toContain('[BAD_REQUEST]');
    const bluesky = await callTool('schedule-post', {
      ...NEW_POST,
      networks: ['linkedin', 'bluesky'],
      text: 'a'.repeat(301),
    });
    expect(bluesky.success).toBe(false);
    expect(errorOf(bluesky)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('delete-post', () => {
  it('[METRICOOL-AC-7] sends DELETE with blogId and returns the id', async () => {
    const fetchMock = mockFetch(jsonResponse({ data: true }));
    const result = await callTool('delete-post', { ...BRAND, id: 555001 });
    expect(result.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('DELETE');
    expect(url.pathname).toBe('/api/v2/scheduler/posts/555001');
    expect(url.searchParams.get('blogId')).toBe('123456');
    expect(result.result).toEqual({ success: true, id: 555001 });
  });
});

describe('get-best-times', () => {
  it('[METRICOOL-AC-8] requests the network and returns days with hourly values', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        data: [
          {
            dayOfWeek: 1,
            bestTimesByHour: [
              { hourOfDay: 9, value: 12 },
              { hourOfDay: 18, value: 40 },
            ],
          },
        ],
      }),
    );
    const result = await callTool('get-best-times', { ...BRAND, ...RANGE, network: 'instagram' });
    expect(result.success).toBe(true);
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/api/v2/scheduler/besttimes/instagram');
    expect(url.searchParams.get('start')).toBe(RANGE.start);
    expect(url.searchParams.get('timezone')).toBe('Europe/Madrid');
    expect(result.result).toEqual({
      network: 'instagram',
      days: [
        {
          dayOfWeek: 1,
          hours: [
            { hour: 9, value: 12 },
            { hour: 18, value: 40 },
          ],
        },
      ],
    });
  });

  it('[METRICOOL-AC-8] refuses a network without best times', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('get-best-times', { ...BRAND, ...RANGE, network: 'twitter' });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('get-metric-timeline', () => {
  it('[METRICOOL-AC-9] sends from and to with the offset of the timezone and returns the values per date', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        data: [
          {
            metric: 'followers',
            values: [
              { dateTime: '2026-07-01T00:00:00+02:00', value: 1200 },
              { dateTime: '2026-07-02T00:00:00+02:00', value: 1215 },
            ],
          },
        ],
      }),
    );
    const result = await callTool('get-metric-timeline', {
      ...BRAND,
      network: 'instagram',
      metric: 'followers',
      subject: 'account',
      from: '2026-07-01T00:00:00',
      to: '2026-12-01T23:59:59',
      timezone: 'Europe/Madrid',
    });
    expect(result.success).toBe(true);
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/api/v2/analytics/timelines');
    expect(queryOf(url)).toEqual({
      blogId: '123456',
      network: 'instagram',
      metric: 'followers',
      subject: 'account',
      from: '2026-07-01T00:00:00+02:00',
      // Winter time: the offset is the one of each date, not of today.
      to: '2026-12-01T23:59:59+01:00',
      timezone: 'Europe/Madrid',
      userId: installationSecrets.METRICOOL_USER_ID,
    });
    expect(result.result).toEqual({
      series: [
        {
          metric: 'followers',
          values: [
            { date: '2026-07-01T00:00:00+02:00', value: 1200 },
            { date: '2026-07-02T00:00:00+02:00', value: 1215 },
          ],
        },
      ],
    });
  });

  it('writes UTC and negative offsets', async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }), jsonResponse({ data: [] }));
    const base = {
      ...BRAND,
      network: 'linkedin',
      metric: 'followers',
      from: '2026-01-15T00:00:00',
      to: '2026-01-16T00:00:00',
    };
    await callTool('get-metric-timeline', { ...base, timezone: 'UTC' });
    await callTool('get-metric-timeline', { ...base, timezone: 'America/St_Johns' });
    expect(requestOf(fetchMock, 0).url.searchParams.get('from')).toBe('2026-01-15T00:00:00+00:00');
    expect(requestOf(fetchMock, 1).url.searchParams.get('from')).toBe('2026-01-15T00:00:00-03:30');
  });
});

describe('list-published-posts', () => {
  const ITEM = { postId: '1789', text: 'Hello', impressions: 1500, likes: 30, engagement: 2.4 };

  it('[METRICOOL-AC-10] requests the type and network and returns the items', async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [ITEM] }));
    const result = await callTool('list-published-posts', {
      ...BRAND,
      network: 'instagram',
      type: 'reels',
      from: '2026-11-01T00:00:00',
      to: '2026-11-30T23:59:59',
    });
    expect(result.success).toBe(true);
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/api/v2/analytics/reels/instagram');
    expect(queryOf(url)).toEqual({
      blogId: '123456',
      from: '2026-11-01T00:00:00',
      to: '2026-11-30T23:59:59',
      userId: installationSecrets.METRICOOL_USER_ID,
    });
    expect(result.result).toEqual({ network: 'instagram', type: 'reels', items: [ITEM] });
  });

  it('[METRICOOL-AC-10] refuses linkedin reels, before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('list-published-posts', {
      ...BRAND,
      network: 'linkedin',
      type: 'reels',
      from: '2026-11-01T00:00:00',
      to: '2026-11-30T23:59:59',
    });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[METRICOOL-AC-10] cuts an oversized answer with limitApplied', async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      ...ITEM,
      postId: String(i),
      text: 'x'.repeat(500),
    }));
    mockFetch(jsonResponse({ data: many }));
    const result = await callTool('list-published-posts', {
      ...BRAND,
      network: 'twitter',
      from: '2026-11-01T00:00:00',
      to: '2026-11-30T23:59:59',
      timezone: 'Europe/Madrid',
    });
    expect(result.success).toBe(true);
    const answer = result.result as { items: unknown[]; limitApplied?: boolean; type: string };
    expect(answer.type).toBe('posts');
    expect(answer.limitApplied).toBe(true);
    expect(answer.items.length).toBeLessThan(300);
    expect(JSON.stringify(answer).length).toBeLessThan(50_000);
  });
});

describe('errors', () => {
  it('[METRICOOL-AC-12] turns a 401 into AUTH_REQUIRED with the config command', async () => {
    mockFetch(jsonResponse({ message: 'Unauthorized' }, 401));
    const result = await callTool('list-brands', {});
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[AUTH_REQUIRED]');
    expect(errorOf(result)).toContain('agentapps config <alias> METRICOOL_USER_TOKEN:<value>');
    expect(errorOf(result)).toContain('API access');
  });

  it('[METRICOOL-AC-12] turns a 429 into RATE_LIMITED', async () => {
    mockFetch(jsonResponse({}, 429, { 'Retry-After': '120' }));
    const result = await callTool('list-brands', {});
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[RATE_LIMITED]');
  });

  it('[METRICOOL-AC-12] refuses a bad brandId, date or timezone, before any request', async () => {
    const fetchMock = mockFetch();
    const cases = [
      { ...RANGE, brandId: '12/3' },
      { ...BRAND, ...RANGE, start: 'tomorrow' },
      { ...BRAND, ...RANGE, start: '2026-02-30T00:00:00' },
      { ...BRAND, ...RANGE, timezone: 'Mars/Phobos' },
    ];
    for (const args of cases) {
      const result = await callTool('list-posts', args);
      expect(result.success, JSON.stringify(args)).toBe(false);
      expect(errorOf(result)).toContain('[BAD_REQUEST]');
    }
    const badPostId = await callTool('delete-post', { ...BRAND, id: '../brands' });
    expect(badPostId.success).toBe(false);
    expect(errorOf(badPostId)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
