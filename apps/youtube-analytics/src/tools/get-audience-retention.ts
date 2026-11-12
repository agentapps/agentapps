import type { AgentApp } from '@agentapps/sdk';
import { channelId, dateRange, optionalOneOf, videoId } from '../lib/args.js';
import { queryReport } from '../lib/report.js';

const AUDIENCE_TYPES = ['ORGANIC', 'AD_INSTREAM', 'AD_INDISPLAY'] as const;
const SUBSCRIBED = ['SUBSCRIBED', 'UNSUBSCRIBED'] as const;

export function registerGetAudienceRetentionTool(app: AgentApp): void {
  app.tool('get-audience-retention', {
    description:
      'Audience retention curve of one video: for each point of the video (elapsedVideoTimeRatio, ' +
      '0.01 to 1.0 in about 100 steps) the share of views still watching (audienceWatchRatio; can ' +
      'exceed 1 where people rewatch) and relativeRetentionPerformance (0-1, compared with videos ' +
      'of similar length; 0.5 is average). Returned as parallel arrays. Use it to find where ' +
      'viewers drop off. Optional filters: audienceType and subscribedStatus (default: all views).',
    parameters: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: '11-character video id of a video on the connected channel.',
        },
        startDate: {
          type: 'string',
          description:
            'First day, YYYY-MM-DD. Default: 27 days before endDate. Use the publish date for the whole life.',
        },
        endDate: { type: 'string', description: 'Last day, YYYY-MM-DD. Default: today.' },
        audienceType: {
          type: 'string',
          enum: [...AUDIENCE_TYPES],
          description:
            'Only ORGANIC views, or views from in-stream (AD_INSTREAM) or in-display (AD_INDISPLAY) ads. Default: all.',
        },
        subscribedStatus: {
          type: 'string',
          enum: [...SUBSCRIBED],
          description: 'Only viewers who are (or are not) subscribed. Default: all.',
        },
        channelId: {
          type: 'string',
          description: 'Channel id (UC...). Default: the connected account’s channel.',
        },
      },
      required: ['videoId'],
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
      const video = videoId(a);
      const range = dateRange(a);
      const audienceType = optionalOneOf(a, 'audienceType', AUDIENCE_TYPES);
      const subscribedStatus = optionalOneOf(a, 'subscribedStatus', SUBSCRIBED);
      const channel = channelId(a);

      // The retention report takes exactly one video in the filter.
      const filters = [`video==${video}`];
      if (audienceType) filters.push(`audienceType==${audienceType}`);
      if (subscribedStatus) filters.push(`subscribedStatus==${subscribedStatus}`);

      const table = await queryReport(ctx, {
        channelId: channel,
        ...range,
        metrics: ['audienceWatchRatio', 'relativeRetentionPerformance'],
        dimensions: ['elapsedVideoTimeRatio'],
        filters,
        sort: 'elapsedVideoTimeRatio',
      });
      const columns = (table.columnHeaders ?? []).map((h) => h.name);
      const series: Record<string, Array<string | number | null>> = {};
      for (const name of columns) series[name] = [];
      for (const row of table.rows ?? []) {
        columns.forEach((name, i) => {
          series[name].push(row[i] ?? null);
        });
      }
      const points = table.rows?.length ?? 0;
      return {
        videoId: video,
        ...range,
        ...(audienceType ? { audienceType } : {}),
        ...(subscribedStatus ? { subscribedStatus } : {}),
        points,
        series,
        ...(points === 0
          ? {
              note: 'No retention data: the video had too few views in this range, or it is not on this channel.',
            }
          : {}),
      };
    },
  });
}
