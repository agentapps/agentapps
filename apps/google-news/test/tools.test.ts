/**
 * Tool and health tests for the Google News Agent App.
 *
 * The network is mocked: every test queues the responses it expects and asserts the
 * request the app sent. The feed below follows the shape of the real Google News RSS
 * (one line of XML, `Headline - Source` titles, a `<description>` whose HTML is
 * entity-escaped), with synthetic stories.
 */

import { describe, expect, it, vi } from 'vitest';
import { callTool, mockFetch, requestOf, runHealthCheck } from './harness.js';

/** An RFC 822 date `hoursAgo` hours (and a few seconds) before now. */
const ago = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000 - 5_000).toUTCString();

function item(title: string, n: number, hoursAgo: number, related: string[] = []): string {
  // As in the real feed, the description is an HTML list with its markup entity-escaped.
  const list = [title.replace(/ - [^-]*$/, ''), ...related]
    .map(
      (t) =>
        `&lt;li&gt;&lt;a href="https://news.google.com/rss/articles/CBMi${n}?oc=5" target="_blank"&gt;${t}&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Example&lt;/font&gt;&lt;/li&gt;`,
    )
    .join('');
  return (
    `<item><title>${title}</title>` +
    `<link>https://news.google.com/rss/articles/CBMi${n}?oc=5</link>` +
    `<guid isPermaLink="false">CBMi${n}</guid>` +
    `<pubDate>${ago(hoursAgo)}</pubDate>` +
    `<description>&lt;ol&gt;${list}&lt;/ol&gt;</description>` +
    `<source url="https://www.example.com">Example Times</source></item>`
  );
}

function feed(...items: string[]): Response {
  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>' +
    '<generator>NFE/5.0</generator><title>Top stories - Google News</title>' +
    '<link>https://news.google.com/?hl=en-US&amp;gl=US&amp;ceid=US:en</link>' +
    `<language>en-US</language>${items.join('')}</channel></rss>`;
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
}

const twenty = () =>
  Array.from({ length: 20 }, (_, i) => item(`Story number ${i} - Example Times`, i, 1));

const errorOf = (res: Record<string, unknown>) =>
  (res.error as { message: string } | undefined)?.message ?? '';

describe('headlines', () => {
  it('requests the global feed and returns the first five stories', async () => {
    const fetchMock = mockFetch(feed(...twenty()));
    const res = await callTool('headlines', {});

    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = requestOf(fetchMock);
    expect(url.origin + url.pathname).toBe('https://news.google.com/rss');
    expect(Object.fromEntries(url.searchParams)).toEqual({ hl: 'en', gl: 'US', ceid: 'US:en' });
    expect(init.method).toBeUndefined(); // GET
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ 'User-Agent': 'AgentApps/1.0 (RSS Reader)' });

    const result = res.result as {
      headlines: Array<Record<string, unknown>>;
      formatted: string;
      count: number;
      topic: string;
      region: string;
    };
    expect(result.count).toBe(5);
    expect(result.topic).toBe('general');
    expect(result.region).toBe('global');
    expect(result.headlines).toHaveLength(5);
    expect(result.headlines[0]).toMatchObject({
      title: 'Story number 0',
      source: 'Example Times',
      url: 'https://news.google.com/rss/articles/CBMi0?oc=5',
      relativeTime: '1h ago',
    });
    expect(typeof result.headlines[0].pubDate).toBe('string');
    expect(result.formatted.split('\n')[0]).toBe('1. **Story number 0** (Example Times, 1h ago)');
    expect(result.formatted.split('\n')).toHaveLength(5);
  });

  it('searches a topic in the edition of the region', async () => {
    const fetchMock = mockFetch(feed(item('La IA avanza - El Ejemplo', 1, 30)));
    const res = await callTool('headlines', {
      topic: 'inteligencia artificial',
      region: 'Spain',
      count: 3,
    });

    const { url } = requestOf(fetchMock);
    expect(url.href).toBe(
      'https://news.google.com/rss/search?q=inteligencia%20artificial&hl=es&gl=ES&ceid=ES%3Aes',
    );
    expect(res.result).toMatchObject({
      count: 1,
      topic: 'inteligencia artificial',
      region: 'Spain',
      headlines: [{ title: 'La IA avanza', source: 'El Ejemplo', relativeTime: '1d ago' }],
    });
  });

  it('caps count at 15 and raises it to at least 1', async () => {
    mockFetch(feed(...twenty()), feed(...twenty()));
    const many = await callTool('headlines', { count: 100 });
    expect((many.result as { count: number }).count).toBe(15);
    const none = await callTool('headlines', { count: 0 });
    expect((none.result as { count: number }).count).toBe(1);
  });

  it('keeps the whole title and reports an unknown source when there is no " - "', async () => {
    mockFetch(
      feed(
        `<item><title><![CDATA[Untitled dispatch]]></title><link>https://news.google.com/rss/articles/CBMi7?oc=5</link><pubDate>${ago(0)}</pubDate><description></description></item>`,
      ),
    );
    const res = await callTool('headlines', {});
    expect(res.result).toMatchObject({
      headlines: [
        {
          title: 'Untitled dispatch',
          source: 'Unknown',
          relativeTime: 'just now',
          relatedHeadlines: [],
        },
      ],
      formatted: '1. **Untitled dispatch** (Unknown, just now)',
    });
  });

  it('returns no headlines for an empty feed', async () => {
    mockFetch(feed());
    const res = await callTool('headlines', { topic: 'zzzz' });
    expect(res.result).toEqual({
      headlines: [],
      formatted: '',
      count: 0,
      topic: 'zzzz',
      region: 'global',
    });
  });

  it('falls back to the US edition for a region it does not know, and still echoes it', async () => {
    const fetchMock = mockFetch(feed());
    const res = await callTool('headlines', { region: 'Argentina' });
    expect(Object.fromEntries(requestOf(fetchMock).url.searchParams)).toEqual({
      hl: 'en',
      gl: 'US',
      ceid: 'US:en',
    });
    expect((res.result as { region: string }).region).toBe('Argentina');
  });

  it('fails with the status and body when Google News answers an error', async () => {
    const fetchMock = mockFetch(new Response('Service Unavailable', { status: 503 }));
    const res = await callTool('headlines', {});
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('Google News RSS error 503: Service Unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const res = await callTool('headlines', {});
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('fetch failed');
  });

  // Bug: the real feed entity-escapes the HTML inside <description> (&lt;a ...&gt;), so the
  // `<a>` pattern in src/rss.ts (fetchNews) never matches and relatedHeadlines is always [].
  it.todo('returns the related headlines of a story from the escaped <description> list');
  // Bug: extractTag returns the raw XML text, so `&amp;` and `&#39;` in a title are not decoded.
  it.todo('decodes XML entities in titles ("Q&amp;A" becomes "Q&A")');
});

describe('health check', () => {
  it('is ready when the feed answers a HEAD request', async () => {
    const fetchMock = mockFetch(new Response(null, { status: 200 }));
    const health = await runHealthCheck();

    expect(health.status).toBe('ready');
    expect(health.message).toBe('Google News RSS reachable');
    const { url, init } = requestOf(fetchMock);
    expect(url.href).toBe('https://news.google.com/rss?hl=en&gl=US&ceid=US:en');
    expect(init.method).toBe('HEAD');
    expect(init.headers).toEqual({ 'User-Agent': 'AgentApps/1.0 (RSS Reader)' });
  });

  it('is not_ready with the status when the feed answers an error', async () => {
    mockFetch(new Response(null, { status: 503 }));
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(health.message).toBe('Google News returned 503');
  });

  it('is not_ready with NETWORK_ERROR when the feed is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(health.message).toBe('Cannot reach Google News RSS');
    expect(health.issues).toEqual([
      { code: 'NETWORK_ERROR', message: 'TypeError: fetch failed', severity: 'error' },
    ]);
  });
});
