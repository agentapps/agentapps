/**
 * YouTube Analytics report tools: the outgoing reports.query and the result shape.
 */

import { describe, expect, it } from 'vitest';
import { ANALYTICS_BASE_URL, DATA_BASE_URL } from '../src/lib/client.js';
import {
  CHANNEL_ID,
  dailyTable,
  demographicsTable,
  emptyTotalsTable,
  retentionTable,
  topVideosTable,
  totalsTable,
  trafficTable,
  VIDEO_A,
  VIDEO_B,
  videosList,
} from './fixtures.js';
import { callTool, jsonResponse, mockFetch, requestOf } from './harness.js';

const query = (fetchMock: Parameters<typeof requestOf>[0], n = 0) => {
  const { url, init } = requestOf(fetchMock, n);
  expect(`${url.origin}${url.pathname}`).toBe(`${ANALYTICS_BASE_URL}/reports`);
  expect(init.method).toBe('GET');
  return Object.fromEntries(url.searchParams);
};

describe('get-channel-report', () => {
  it('returns totals for the default 28-day window', async () => {
    const fetchMock = mockFetch(jsonResponse(totalsTable));
    const result = await callTool('get-channel-report', {});
    expect(result.success).toBe(true);
    const q = query(fetchMock);
    expect(q.ids).toBe('channel==MINE');
    expect(q.metrics).toBe(
      'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares',
    );
    expect(q.dimensions).toBeUndefined();
    const days = (Date.parse(q.endDate) - Date.parse(q.startDate)) / 86_400_000;
    expect(days).toBe(27);
    const r = result.result as Record<string, unknown>;
    expect(r.groupBy).toBe('none');
    expect(r.totals).toEqual({
      views: 1520,
      estimatedMinutesWatched: 4210,
      averageViewDuration: 166,
      averageViewPercentage: 38.7,
      subscribersGained: 12,
      subscribersLost: 3,
      likes: 88,
      comments: 9,
      shares: 4,
    });
  });

  it('reports null totals and a note when the API returns no rows', async () => {
    mockFetch(jsonResponse(emptyTotalsTable));
    const result = await callTool('get-channel-report', {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    const r = result.result as Record<string, unknown>;
    expect((r.totals as Record<string, unknown>).views).toBeNull();
    expect(r.note).toContain('No data');
  });

  it('builds a daily series sorted by day for another owned channel', async () => {
    const fetchMock = mockFetch(jsonResponse(dailyTable));
    const result = await callTool('get-channel-report', {
      groupBy: 'day',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      channelId: CHANNEL_ID,
    });
    const q = query(fetchMock);
    expect(q).toMatchObject({
      ids: `channel==${CHANNEL_ID}`,
      dimensions: 'day',
      sort: 'day',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
    });
    expect(q.maxResults).toBeUndefined();
    const r = result.result as Record<string, unknown>;
    expect(r.columns).toEqual(['day', ...dailyTable.columnHeaders.slice(1).map((h) => h.name)]);
    expect(r.rows).toEqual(dailyTable.rows);
    expect(r.rowCount).toBe(2);
  });

  it('moves both dates to the first of the month for groupBy month', async () => {
    const fetchMock = mockFetch(jsonResponse({ ...dailyTable, rows: [] }));
    const result = await callTool('get-channel-report', {
      groupBy: 'month',
      startDate: '2025-03-15',
      endDate: '2026-02-20',
    });
    const q = query(fetchMock);
    expect(q).toMatchObject({
      dimensions: 'month',
      sort: 'month',
      startDate: '2025-03-01',
      endDate: '2026-02-01',
    });
    expect((result.result as Record<string, unknown>).startDate).toBe('2025-03-01');
  });

  it('uses views-only metrics, sort and maxResults for a traffic-source breakdown with a country filter', async () => {
    const fetchMock = mockFetch(jsonResponse(trafficTable));
    const result = await callTool('get-channel-report', {
      groupBy: 'trafficSource',
      country: 'es',
      maxResults: 5,
    });
    const q = query(fetchMock);
    expect(q).toMatchObject({
      dimensions: 'insightTrafficSourceType',
      metrics: 'views,estimatedMinutesWatched',
      filters: 'country==ES',
      sort: '-views',
      maxResults: '5',
    });
    const r = result.result as Record<string, unknown>;
    expect(r.country).toBe('ES');
    expect(r.rows).toEqual(trafficTable.rows);
  });

  it('accepts custom metrics as a comma-separated string', async () => {
    const fetchMock = mockFetch(jsonResponse(totalsTable));
    await callTool('get-channel-report', { metrics: 'views, engagedViews' });
    expect(query(fetchMock).metrics).toBe('views,engagedViews');
  });

  it.each([
    [{ groupBy: 'week' }, 'groupBy must be one of'],
    [{ startDate: '2026-02-30' }, 'startDate must be a date'],
    [{ startDate: '2026-05-02', endDate: '2026-05-01' }, 'is after endDate'],
    [{ groupBy: 'day', startDate: '2024-01-01', endDate: '2026-01-01' }, 'Use groupBy month'],
    [{ groupBy: 'country', country: 'US' }, 'cannot be combined'],
    [{ country: 'Spain' }, 'two-letter'],
    [{ channelId: '../MINE' }, 'starting with UC'],
    [{ metrics: ['views;drop'] }, 'invalid metric name'],
    [{ groupBy: 'country', maxResults: 500 }, 'maxResults must be an integer from 1 to 200'],
  ])('rejects %j before any request', async (args, message) => {
    const fetchMock = mockFetch();
    const result = await callTool('get-channel-report', args);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('[BAD_REQUEST]');
    expect(JSON.stringify(result.error)).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cuts an oversized result under 50,000 characters and says so', async () => {
    const rows = Array.from({ length: 400 }, (_, i) => [
      `2025-${String((i % 12) + 1).padStart(2, '0')}-01`,
      ...Array.from({ length: 19 }, () => 123456789.123),
    ]);
    mockFetch(
      jsonResponse({
        kind: 'youtubeAnalytics#resultTable',
        columnHeaders: [
          { name: 'day', columnType: 'DIMENSION', dataType: 'STRING' },
          ...Array.from({ length: 19 }, (_, i) => ({
            name: `metric${i}`,
            columnType: 'METRIC',
            dataType: 'FLOAT',
          })),
        ],
        rows,
      }),
    );
    const result = await callTool('get-channel-report', {
      groupBy: 'day',
      startDate: '2025-01-01',
      endDate: '2026-01-31',
    });
    const r = result.result as Record<string, unknown>;
    expect(JSON.stringify(r).length).toBeLessThan(50_000);
    expect(r.limitApplied).toBe(true);
    expect((r.rows as unknown[]).length).toBeLessThan(400);
    expect(r.note).toContain('Narrow the date range');
  });
});

describe('get-video-report', () => {
  it('filters the report to the video', async () => {
    const fetchMock = mockFetch(jsonResponse(dailyTable));
    const result = await callTool('get-video-report', {
      videoId: VIDEO_A,
      groupBy: 'day',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
    });
    expect(query(fetchMock)).toMatchObject({ filters: `video==${VIDEO_A}`, dimensions: 'day' });
    expect((result.result as Record<string, unknown>).videoId).toBe(VIDEO_A);
  });

  it('joins the video and country filters with ";"', async () => {
    const fetchMock = mockFetch(jsonResponse(totalsTable));
    await callTool('get-video-report', { videoId: VIDEO_A, country: 'US' });
    expect(query(fetchMock).filters).toBe(`video==${VIDEO_A};country==US`);
  });

  it.each([
    [{}],
    [{ videoId: 'short' }],
    [{ videoId: 'aaaaaaaaa/1' }],
  ])('rejects a missing or malformed videoId %j before any request', async (args) => {
    const fetchMock = mockFetch();
    const result = await callTool('get-video-report', args);
    expect(JSON.stringify(result.error)).toContain('videoId');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('get-top-videos', () => {
  it('ranks videos and resolves titles with one batched lookup', async () => {
    const fetchMock = mockFetch(jsonResponse(topVideosTable), jsonResponse(videosList));
    const result = await callTool('get-top-videos', {
      orderBy: 'estimatedMinutesWatched',
      maxResults: 2,
      country: 'DE',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    expect(result.success).toBe(true);
    expect(query(fetchMock)).toMatchObject({
      dimensions: 'video',
      sort: '-estimatedMinutesWatched',
      maxResults: '2',
      filters: 'country==DE',
    });
    const lookup = requestOf(fetchMock, 1).url;
    expect(`${lookup.origin}${lookup.pathname}`).toBe(`${DATA_BASE_URL}/videos`);
    expect(lookup.searchParams.get('id')).toBe(`${VIDEO_A},${VIDEO_B}`);
    expect(lookup.searchParams.get('part')).toBe('snippet,contentDetails');

    const r = result.result as { videos: Array<Record<string, unknown>>; count: number };
    expect(r.count).toBe(2);
    expect(r.videos[0]).toMatchObject({
      id: VIDEO_A,
      title: 'First video',
      url: `https://www.youtube.com/watch?v=${VIDEO_A}`,
      durationSeconds: 725,
      views: 900,
      estimatedMinutesWatched: 2500,
      subscribersGained: 8,
    });
    expect(r.videos[0]).not.toHaveProperty('video');
  });

  it('skips the title lookup when there are no rows', async () => {
    const fetchMock = mockFetch(jsonResponse({ ...topVideosTable, rows: undefined }));
    const result = await callTool('get-top-videos', {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((result.result as Record<string, unknown>).count).toBe(0);
    expect(query(fetchMock)).toMatchObject({ sort: '-views', maxResults: '10' });
  });

  it.each([
    [{ orderBy: 'likes' }],
    [{ maxResults: 51 }],
    [{ maxResults: 0 }],
  ])('rejects %j before any request', async (args) => {
    const fetchMock = mockFetch();
    const result = await callTool('get-top-videos', args);
    expect(JSON.stringify(result.error)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('get-audience-retention', () => {
  it('queries one video with its filters and returns parallel arrays', async () => {
    const fetchMock = mockFetch(jsonResponse(retentionTable));
    const result = await callTool('get-audience-retention', {
      videoId: VIDEO_A,
      audienceType: 'ORGANIC',
      subscribedStatus: 'UNSUBSCRIBED',
    });
    expect(query(fetchMock)).toMatchObject({
      dimensions: 'elapsedVideoTimeRatio',
      metrics: 'audienceWatchRatio,relativeRetentionPerformance',
      filters: `video==${VIDEO_A};audienceType==ORGANIC;subscribedStatus==UNSUBSCRIBED`,
      sort: 'elapsedVideoTimeRatio',
    });
    const r = result.result as Record<string, unknown>;
    expect(r.points).toBe(3);
    expect(r.series).toEqual({
      elapsedVideoTimeRatio: [0.01, 0.02, 0.03],
      audienceWatchRatio: [1.02, 0.88, 0.71],
      relativeRetentionPerformance: [0.61, 0.55, 0.5],
    });
  });

  it('explains an empty curve', async () => {
    mockFetch(jsonResponse({ ...retentionTable, rows: undefined }));
    const result = await callTool('get-audience-retention', { videoId: VIDEO_A });
    expect((result.result as Record<string, unknown>).note).toContain('too few views');
  });

  it('rejects an unknown audienceType before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('get-audience-retention', {
      videoId: VIDEO_A,
      audienceType: 'PAID',
    });
    expect(JSON.stringify(result.error)).toContain('audienceType must be one of');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('get-demographics', () => {
  it('breaks viewerPercentage down by age and gender by default', async () => {
    const fetchMock = mockFetch(jsonResponse(demographicsTable));
    const result = await callTool('get-demographics', { videoId: VIDEO_B, country: 'MX' });
    expect(query(fetchMock)).toMatchObject({
      metrics: 'viewerPercentage',
      dimensions: 'ageGroup,gender',
      sort: 'ageGroup,gender',
      filters: `video==${VIDEO_B};country==MX`,
    });
    const r = result.result as Record<string, unknown>;
    expect(r.columns).toEqual(['ageGroup', 'gender', 'viewerPercentage']);
    expect(r.rows).toEqual(demographicsTable.rows);
  });

  it('can break down by gender only and notes hidden data', async () => {
    const fetchMock = mockFetch(jsonResponse({ ...demographicsTable, rows: undefined }));
    const result = await callTool('get-demographics', { breakdown: 'gender' });
    expect(query(fetchMock).dimensions).toBe('gender');
    expect((result.result as Record<string, unknown>).note).toContain('too few');
  });
});

describe('run-report', () => {
  it('sends the given metrics, dimensions, filters, sort and paging', async () => {
    const fetchMock = mockFetch(jsonResponse(trafficTable));
    const result = await callTool('run-report', {
      metrics: ['views', 'estimatedMinutesWatched'],
      dimensions: ['insightTrafficSourceType'],
      filters: `video==${VIDEO_A},${VIDEO_B};country==US`,
      sort: '-views',
      maxResults: 3,
      startIndex: 4,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    expect(query(fetchMock)).toMatchObject({
      metrics: 'views,estimatedMinutesWatched',
      dimensions: 'insightTrafficSourceType',
      filters: `video==${VIDEO_A},${VIDEO_B};country==US`,
      sort: '-views',
      maxResults: '3',
      startIndex: '4',
    });
    // A full page may have more rows behind it.
    expect((result.result as Record<string, unknown>).nextStartIndex).toBe(7);
  });

  it('returns totals without dimensions', async () => {
    mockFetch(jsonResponse(totalsTable));
    const result = await callTool('run-report', { metrics: 'views' });
    expect((result.result as Record<string, unknown>).totals).toBeDefined();
  });

  it.each([
    [{}, 'metrics is required'],
    [{ metrics: ['views'], filters: 'video==a&ids=channel==UCother' }, 'filters must look like'],
    [{ metrics: ['views'], dimensions: ['day;x'] }, 'dimensions must be'],
    [{ metrics: ['views'], sort: 'views desc' }, 'sort must be'],
    [{ metrics: ['views'], maxResults: 5000 }, 'maxResults must be'],
  ])('rejects %j before any request', async (args, message) => {
    const fetchMock = mockFetch();
    const result = await callTool('run-report', args);
    expect(JSON.stringify(result.error)).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
