/**
 * Tool, client and health tests for the Postiz Agent App. The API is mocked (fetch).
 *
 * Mock bodies follow the examples in Postiz's OpenAPI document
 * (https://docs.postiz.com/public-api/openapi.json) with synthetic values.
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

const CHANNELS = [
  {
    id: 'cm4ean69r0003w8w1cdomox9n',
    name: 'Ada Example',
    identifier: 'x',
    picture: 'https://uploads.postiz.com/avatar.jpg',
    disabled: false,
    profile: 'adaexample',
    customer: { id: 'customer-id', name: 'Example Co' },
  },
];

const bodyOf = (init: RequestInit) => JSON.parse(String(init.body));
const errorOf = (result: Record<string, unknown>) => JSON.stringify(result.error);

describe('health', () => {
  it('[POSTIZ-AC-2] is ready on a 200 from /is-connected', async () => {
    const fetchMock = mockFetch(jsonResponse({ connected: true }));
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestOf(fetchMock).url.href).toBe(`${BASE_URL}/is-connected`);
  });

  it('[POSTIZ-AC-2] is not ready on a 401', async () => {
    mockFetch(jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401));
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
      jsonResponse(CHANNELS),
    );
    const result = await callTool('list-channels', {});
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never sends a POST twice', async () => {
    const fetchMock = mockFetch(jsonResponse({}, 503, { 'Retry-After': '0' }));
    const result = await callTool('publish-post', {
      channels: [{ id: 'ch1', content: 'Hello' }],
    });
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps a long error body and reports the status', async () => {
    mockFetch(new Response('x'.repeat(10_000), { status: 500, statusText: 'Server Error' }));
    const result = await callTool('list-channels', {});
    expect(result.success).toBe(false);
    const message = errorOf(result);
    expect(message).toContain('500');
    expect(message.length).toBeLessThan(3_000);
  });

  it('never puts a secret value in an error message', async () => {
    const key = installationSecrets.POSTIZ_API_KEY;
    mockFetch(jsonResponse({ error: 'unauthorized' }, 401));
    const result = await callTool('list-channels', {});
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain(key);
  });

  it('[POSTIZ-AC-1] rejects a POSTIZ_API_URL that is neither "cloud" nor a URL, before any request', async () => {
    installationSecrets.POSTIZ_API_URL = 'postiz.example.com';
    const fetchMock = mockFetch();
    const result = await callTool('list-channels', {});
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('POSTIZ_API_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('list-channels', () => {
  it('[POSTIZ-AC-1] calls Postiz Cloud with the raw key when POSTIZ_API_URL is "cloud"', async () => {
    const fetchMock = mockFetch(jsonResponse(CHANNELS));
    const result = await callTool('list-channels', {});
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      channels: [
        {
          id: 'cm4ean69r0003w8w1cdomox9n',
          name: 'Ada Example',
          provider: 'x',
          profile: 'adaexample',
          disabled: false,
        },
      ],
    });
    const { url, init } = requestOf(fetchMock);
    expect(url.href).toBe('https://api.postiz.com/public/v1/integrations');
    expect(init.method).toBe('GET');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('fake-postiz_api_key');
    expect(headers.Authorization).not.toContain('Bearer');
  });

  it('[POSTIZ-AC-1] calls the self-hosted base URL when one is configured', async () => {
    installationSecrets.POSTIZ_API_URL = 'https://postiz.example.com/api/public/v1/';
    const fetchMock = mockFetch(jsonResponse(CHANNELS));
    const result = await callTool('list-channels', {});
    expect(result.success).toBe(true);
    expect(requestOf(fetchMock).url.href).toBe(
      'https://postiz.example.com/api/public/v1/integrations',
    );
  });
});

describe('find-next-slot', () => {
  it('[POSTIZ-AC-3] returns the date Postiz answered', async () => {
    const fetchMock = mockFetch(jsonResponse({ date: '2025-01-15T10:00:00.000Z' }));
    const result = await callTool('find-next-slot', { channelId: 'ch1' });
    expect(result.result).toEqual({ channelId: 'ch1', date: '2025-01-15T10:00:00.000Z' });
    expect(requestOf(fetchMock).url.pathname).toBe('/public/v1/find-slot/ch1');
  });
});

describe('find-next-slot: live answer', () => {
  it('[POSTIZ-AC-3] marks a date without a zone as UTC', async () => {
    // A self-hosted Postiz answered { "date": "2026-11-24T02:00:00" } in the live test.
    mockFetch(jsonResponse({ date: '2026-11-24T02:00:00' }));
    const result = await callTool('find-next-slot', { channelId: 'ch1' });
    expect(result.result).toEqual({ channelId: 'ch1', date: '2026-11-24T02:00:00Z' });
  });
});

describe('list-posts', () => {
  const post = (id: string, content: string) => ({
    id,
    content,
    settings: { __type: 'x' },
    publishDate: '2024-12-14T10:00:00.000Z',
    releaseURL: 'https://x.com/adaexample/status/1',
    state: 'PUBLISHED',
    error: null,
    integration: {
      id: 'ch1',
      providerIdentifier: 'x',
      name: 'Ada Example',
      picture: 'https://uploads.postiz.com/avatar.jpg',
    },
  });

  it('[POSTIZ-AC-4] sends the date range and returns the curated fields', async () => {
    const fetchMock = mockFetch(jsonResponse({ posts: [post('p1', 'a'.repeat(400))] }));
    const result = await callTool('list-posts', {
      startDate: '2024-12-01T00:00:00Z',
      endDate: '2024-12-31T23:59:59Z',
    });
    expect(result.result).toEqual({
      posts: [
        {
          id: 'p1',
          channel: { id: 'ch1', name: 'Ada Example', provider: 'x' },
          status: 'PUBLISHED',
          publishDate: '2024-12-14T10:00:00.000Z',
          preview: 'a'.repeat(280),
          releaseUrl: 'https://x.com/adaexample/status/1',
        },
      ],
    });
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/public/v1/posts');
    expect(url.searchParams.get('startDate')).toBe('2024-12-01T00:00:00.000Z');
    expect(url.searchParams.get('endDate')).toBe('2024-12-31T23:59:59.000Z');
  });

  it('[POSTIZ-AC-4] cuts an oversized answer with limitApplied', async () => {
    const posts = Array.from({ length: 300 }, (_, i) => post(`p${i}`, 'b'.repeat(280)));
    mockFetch(jsonResponse({ posts }));
    const result = await callTool('list-posts', {
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-12-31T23:59:59Z',
    });
    const body = result.result as { posts: unknown[]; limitApplied?: boolean; message?: string };
    expect(body.limitApplied).toBe(true);
    expect(body.posts.length).toBeGreaterThan(0);
    expect(body.posts.length).toBeLessThan(300);
    expect(body.message).toContain('Narrow the date range');
    expect(JSON.stringify(body).length).toBeLessThan(50_000);
  });
});

describe('create-draft, schedule-post, publish-post', () => {
  const created = [{ postId: 'post-123', integration: 'ch1' }];
  const future = new Date(Date.now() + 86_400_000).toISOString();

  it('[POSTIZ-AC-5] create-draft sends type draft and returns a short summary', async () => {
    const fetchMock = mockFetch(jsonResponse(created));
    const result = await callTool('create-draft', {
      channels: [
        {
          id: 'ch1',
          content: 'Hello',
          media: [{ id: 'm1', url: 'https://uploads.postiz.com/1.png' }],
          settings: { __type: 'x', who_can_reply_post: 'everyone' },
        },
      ],
    });
    expect(result.result).toEqual({
      success: true,
      posts: [{ postId: 'post-123', channelId: 'ch1' }],
    });
    const { url, init } = requestOf(fetchMock);
    expect(url.pathname).toBe('/public/v1/posts');
    expect(init.method).toBe('POST');
    const body = bodyOf(init);
    expect(body.type).toBe('draft');
    expect(body.shortLink).toBe(false);
    expect(body.tags).toEqual([]);
    expect(Number.isNaN(Date.parse(body.date))).toBe(false);
    expect(body.posts).toEqual([
      {
        integration: { id: 'ch1' },
        value: [
          { content: 'Hello', image: [{ id: 'm1', path: 'https://uploads.postiz.com/1.png' }] },
        ],
        settings: { __type: 'x', who_can_reply_post: 'everyone' },
      },
    ]);
  });

  it('[POSTIZ-AC-5] schedule-post sends type schedule with the date', async () => {
    const fetchMock = mockFetch(jsonResponse(created));
    const result = await callTool('schedule-post', {
      channels: [{ id: 'ch1', content: 'Hello' }],
      date: future,
    });
    expect(result.success).toBe(true);
    const body = bodyOf(requestOf(fetchMock).init);
    expect(body.type).toBe('schedule');
    expect(body.date).toBe(future);
  });

  it('[POSTIZ-AC-5] publish-post sends type now', async () => {
    const fetchMock = mockFetch(jsonResponse(created));
    const result = await callTool('publish-post', {
      channels: [{ id: 'ch1', content: 'Hello' }],
    });
    expect(result.success).toBe(true);
    expect(bodyOf(requestOf(fetchMock).init).type).toBe('now');
  });

  it('[POSTIZ-AC-5] schedule-post without date fails with BAD_REQUEST and sends nothing', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('schedule-post', {
      channels: [{ id: 'ch1', content: 'Hello' }],
    });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[POSTIZ-AC-5] schedule-post rejects a date in the past, before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('schedule-post', {
      channels: [{ id: 'ch1', content: 'Hello' }],
      date: '2020-01-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('in the future');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an empty channel list, before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('publish-post', { channels: [] });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('delete-post', () => {
  it('[POSTIZ-AC-6] deletes the post and returns its id', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 'p1' }));
    const result = await callTool('delete-post', { id: 'p1' });
    expect(result.result).toEqual({ success: true, id: 'p1' });
    const { url, init } = requestOf(fetchMock);
    expect(url.pathname).toBe('/public/v1/posts/p1');
    expect(init.method).toBe('DELETE');
  });

  it('[POSTIZ-AC-6] reports a 404 as already deleted', async () => {
    mockFetch(jsonResponse({ statusCode: 404, message: 'Not Found' }, 404));
    const result = await callTool('delete-post', { id: 'p1' });
    expect(result.result).toEqual({ success: true, id: 'p1', alreadyDeleted: true });
  });
});

describe('upload-media-from-url', () => {
  it('[POSTIZ-AC-7] posts the url and returns the media id and url', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        id: 'e639003b-f727-4a1e-87bd-74a2c48ae41e',
        name: 'image.png',
        path: 'https://uploads.postiz.com/image.png',
        organizationId: '85460a39-6329-4cf4-a252-187ce89a3480',
        createdAt: '2024-12-14T08:18:54.274Z',
        updatedAt: '2024-12-14T08:18:54.274Z',
      }),
    );
    const result = await callTool('upload-media-from-url', {
      url: 'https://example.com/image.png',
    });
    expect(result.result).toEqual({
      success: true,
      id: 'e639003b-f727-4a1e-87bd-74a2c48ae41e',
      url: 'https://uploads.postiz.com/image.png',
    });
    const { url, init } = requestOf(fetchMock);
    expect(url.pathname).toBe('/public/v1/upload-from-url');
    expect(init.method).toBe('POST');
    expect(bodyOf(init)).toEqual({ url: 'https://example.com/image.png' });
  });
});

describe('analytics', () => {
  const metrics = [
    {
      label: 'Followers',
      data: [
        { total: '1250', date: '2025-01-01' },
        { total: '1280', date: '2025-01-02' },
      ],
      percentageChange: 2.4,
    },
  ];
  const shaped = [
    {
      label: 'Followers',
      data: [
        { date: '2025-01-01', total: '1250' },
        { date: '2025-01-02', total: '1280' },
      ],
      percentageChange: 2.4,
    },
  ];

  it('[POSTIZ-AC-8] get-channel-analytics returns label, per-date totals and change', async () => {
    const fetchMock = mockFetch(jsonResponse(metrics));
    const result = await callTool('get-channel-analytics', { channelId: 'ch1', days: 7 });
    expect(result.result).toEqual({ channelId: 'ch1', days: 7, metrics: shaped });
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/public/v1/analytics/ch1');
    expect(url.searchParams.get('date')).toBe('7');
  });

  it('[POSTIZ-AC-8] get-post-analytics returns the same shape', async () => {
    const fetchMock = mockFetch(jsonResponse(metrics));
    const result = await callTool('get-post-analytics', { postId: 'p1', days: 30 });
    expect(result.result).toEqual({ postId: 'p1', days: 30, metrics: shaped });
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/public/v1/analytics/post/p1');
    expect(url.searchParams.get('date')).toBe('30');
  });

  it('[POSTIZ-AC-8] days above 90 fails with BAD_REQUEST', async () => {
    const fetchMock = mockFetch();
    for (const [tool, args] of [
      ['get-channel-analytics', { channelId: 'ch1', days: 91 }],
      ['get-post-analytics', { postId: 'p1', days: 91 }],
    ] as const) {
      const result = await callTool(tool, args);
      expect(result.success).toBe(false);
      expect(errorOf(result)).toContain('[BAD_REQUEST]');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('list-media', () => {
  it('[POSTIZ-AC-11] sends page and search and returns the curated files', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        pages: 2,
        results: [
          {
            id: 'e639003b-f727-4a1e-87bd-74a2c48ae41e',
            name: '6fba0ef5febb4400ae8778a5b854224d.png',
            originalName: 'cover-cyan.png',
            path: 'https://uploads.postiz.com/6fba0ef5febb4400ae8778a5b854224d.png',
            createdAt: '2024-12-14T08:18:54.274Z',
          },
          {
            // A file imported by URL on a live instance has no uploaded name.
            id: 'd0ba240e-91af-477f-aedd-edc17500bb3a',
            name: 'e259107c2362adfdc777d164bce57ceff.png',
            originalName: null,
            path: 'http://localhost:4007/uploads/2026/11/23/e259107c2362adfdc777d164bce57ceff.png',
            createdAt: '2026-11-23T12:35:40.666Z',
          },
        ],
      }),
    );
    const result = await callTool('list-media', { page: 2, search: 'cover' });
    expect(result.result).toEqual({
      files: [
        {
          id: 'e639003b-f727-4a1e-87bd-74a2c48ae41e',
          url: 'https://uploads.postiz.com/6fba0ef5febb4400ae8778a5b854224d.png',
          name: 'cover-cyan.png',
          createdAt: '2024-12-14T08:18:54.274Z',
        },
        {
          id: 'd0ba240e-91af-477f-aedd-edc17500bb3a',
          url: 'http://localhost:4007/uploads/2026/11/23/e259107c2362adfdc777d164bce57ceff.png',
          name: 'e259107c2362adfdc777d164bce57ceff.png',
          createdAt: '2026-11-23T12:35:40.666Z',
        },
      ],
      page: 2,
      pages: 2,
    });
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/public/v1/media');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('search')).toBe('cover');
  });
});

describe('list-notifications', () => {
  it('[POSTIZ-AC-12] sends page 0 by default and returns the curated notifications', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        notifications: [
          {
            id: 'n1',
            content: 'Your post on X failed',
            link: null,
            createdAt: '2026-11-23T10:00:00.000Z',
          },
        ],
        total: 1,
        page: 0,
        limit: 100,
        hasMore: false,
      }),
    );
    const result = await callTool('list-notifications', {});
    expect(result.result).toEqual({
      notifications: [
        {
          id: 'n1',
          content: 'Your post on X failed',
          link: null,
          createdAt: '2026-11-23T10:00:00.000Z',
        },
      ],
      page: 0,
      total: 1,
      hasMore: false,
    });
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/public/v1/notifications');
    expect(url.searchParams.get('page')).toBe('0');
  });

  it('[POSTIZ-AC-12] cuts an oversized answer with limitApplied', async () => {
    const notifications = Array.from({ length: 100 }, (_, i) => ({
      id: `n${i}`,
      content: 'c'.repeat(1_000),
      link: null,
      createdAt: '2026-11-23T10:00:00.000Z',
    }));
    mockFetch(jsonResponse({ notifications, total: 250, page: 0, limit: 100, hasMore: true }));
    const result = await callTool('list-notifications', {});
    const body = result.result as { notifications: unknown[]; limitApplied?: boolean };
    expect(body.limitApplied).toBe(true);
    expect(body.notifications.length).toBeGreaterThan(0);
    expect(body.notifications.length).toBeLessThan(100);
    expect(JSON.stringify(body).length).toBeLessThan(50_000);
  });
});

describe('errors', () => {
  it('[POSTIZ-AC-10] a 401 yields AUTH_REQUIRED with the config command', async () => {
    mockFetch(jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401));
    const result = await callTool('list-channels', {});
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[AUTH_REQUIRED]');
    expect(errorOf(result)).toContain('agentapps config <alias> POSTIZ_API_KEY:<value>');
  });

  it('[POSTIZ-AC-10] a 429 yields RATE_LIMITED', async () => {
    mockFetch(jsonResponse({ statusCode: 429, message: 'Too Many Requests' }, 429));
    const result = await callTool('publish-post', {
      channels: [{ id: 'ch1', content: 'Hello' }],
    });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[RATE_LIMITED]');
    expect(errorOf(result)).toContain('per hour');
  });

  it('[POSTIZ-AC-10] an id containing "/" yields BAD_REQUEST and no request', async () => {
    const fetchMock = mockFetch();
    for (const [tool, args] of [
      ['find-next-slot', { channelId: '../admin' }],
      ['delete-post', { id: 'a/b' }],
      ['get-channel-analytics', { channelId: 'a/b', days: 7 }],
      ['get-post-analytics', { postId: 'a/b', days: 7 }],
      ['publish-post', { channels: [{ id: 'a/b', content: 'Hello' }] }],
    ] as const) {
      const result = await callTool(tool, args);
      expect(result.success, tool).toBe(false);
      expect(errorOf(result), tool).toContain('[BAD_REQUEST]');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
