import type { AgentApp } from '@agentapps/sdk';
import { channelId, country, dateRange, intInRange, oneOf } from '../lib/args.js';
import { queryReport } from '../lib/report.js';
import { durationSeconds, fetchVideos, videoUrl } from '../lib/youtube.js';

/** Sorts the top-videos report supports without the monetary scope. */
const ORDER_BY = [
  'views',
  'estimatedMinutesWatched',
  'subscribersGained',
  'subscribersLost',
] as const;
const METRICS = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'averageViewPercentage',
  'likes',
  'comments',
  'shares',
  'subscribersGained',
  'subscribersLost',
];

export function registerGetTopVideosTool(app: AgentApp): void {
  app.tool('get-top-videos', {
    description:
      'The channel’s best-performing videos in a date range, ranked by views, watch time or ' +
      'subscribers gained or lost. Each row has the video id, title, publishedAt, url, duration ' +
      'and views, estimatedMinutesWatched, averageViewDuration (seconds), averageViewPercentage, ' +
      'likes, comments, shares, subscribersGained, subscribersLost for that range. At most 50 ' +
      'videos. Use get-video-report on an id for its breakdown.',
    parameters: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'First day, YYYY-MM-DD (Pacific time). Default: 27 days before endDate.',
        },
        endDate: { type: 'string', description: 'Last day, YYYY-MM-DD. Default: today.' },
        orderBy: {
          type: 'string',
          enum: [...ORDER_BY],
          description: 'Ranking metric, highest first. Default views.',
        },
        maxResults: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Number of videos (1-50, default 10).',
        },
        country: {
          type: 'string',
          description: 'Only count viewers in this country (ISO 3166-1 alpha-2, e.g. US).',
        },
        channelId: {
          type: 'string',
          description: 'Channel id (UC...). Default: the connected account’s channel.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const range = dateRange(a);
      const orderBy = oneOf(a, 'orderBy', ORDER_BY, 'views');
      const maxResults = intInRange(a, 'maxResults', 1, 50, 10);
      const countryCode = country(a);
      const channel = channelId(a);

      const table = await queryReport(ctx, {
        channelId: channel,
        ...range,
        metrics: METRICS,
        dimensions: ['video'],
        filters: countryCode ? [`country==${countryCode}`] : [],
        sort: `-${orderBy}`,
        maxResults,
      });
      const columns = (table.columnHeaders ?? []).map((h) => h.name);
      const rows = (table.rows ?? []).map((row) =>
        Object.fromEntries(columns.map((name, i) => [name, row[i]])),
      );

      // One batched lookup for titles instead of returning bare ids.
      const ids = rows.map((r) => String(r.video));
      const details = ids.length > 0 ? await fetchVideos(ctx, ids, 'snippet,contentDetails') : [];
      const byId = new Map(details.map((v) => [v.id, v]));

      const videos = rows.map((r) => {
        const id = String(r.video);
        const v = byId.get(id);
        const { video: _video, ...metrics } = r;
        return {
          id,
          title: v?.snippet?.title ?? null,
          publishedAt: v?.snippet?.publishedAt ?? null,
          url: videoUrl(id),
          durationSeconds: durationSeconds(v?.contentDetails?.duration),
          ...metrics,
        };
      });
      return {
        channel: channel ?? 'MINE',
        ...range,
        orderBy,
        ...(countryCode ? { country: countryCode } : {}),
        videos,
        count: videos.length,
        ...(videos.length === 0 ? { note: 'No views in this range.' } : {}),
      };
    },
  });
}
