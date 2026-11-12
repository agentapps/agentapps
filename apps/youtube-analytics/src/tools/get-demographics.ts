import type { AgentApp } from '@agentapps/sdk';
import { channelId, country, dateRange, idLike, oneOf, videoId } from '../lib/args.js';
import { queryReport } from '../lib/report.js';

const BREAKDOWN = ['ageGroup', 'gender', 'ageGroupAndGender'] as const;

export function registerGetDemographicsTool(app: AgentApp): void {
  app.tool('get-demographics', {
    description:
      'Viewer age and gender for the channel or one video: the percentage of views (signed-in ' +
      'viewers only) per ageGroup (age13-17 ... age65-) and/or gender (female, male, ' +
      'user_specified). Returns { columns, rows } with viewerPercentage (0-100). YouTube hides ' +
      'demographics when there are too few viewers, so small channels may get no rows.',
    parameters: {
      type: 'object',
      properties: {
        breakdown: {
          type: 'string',
          enum: [...BREAKDOWN],
          description: 'ageGroup, gender, or both together (ageGroupAndGender, default).',
        },
        startDate: {
          type: 'string',
          description: 'First day, YYYY-MM-DD. Default: 27 days before endDate.',
        },
        endDate: { type: 'string', description: 'Last day, YYYY-MM-DD. Default: today.' },
        videoId: {
          type: 'string',
          description: 'Only this video (11-character id). Default: the whole channel.',
        },
        country: {
          type: 'string',
          description: 'Only viewers in this country (ISO 3166-1 alpha-2).',
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
      const breakdown = oneOf(a, 'breakdown', BREAKDOWN, 'ageGroupAndGender');
      const range = dateRange(a);
      const video = idLike(a, 'videoId') === undefined ? undefined : videoId(a);
      const countryCode = country(a);
      const channel = channelId(a);

      const dimensions = breakdown === 'ageGroupAndGender' ? ['ageGroup', 'gender'] : [breakdown];
      const filters: string[] = [];
      if (video) filters.push(`video==${video}`);
      if (countryCode) filters.push(`country==${countryCode}`);

      const table = await queryReport(ctx, {
        channelId: channel,
        ...range,
        metrics: ['viewerPercentage'],
        dimensions,
        filters,
        sort: dimensions.join(','),
      });
      const rows = table.rows ?? [];
      return {
        channel: channel ?? 'MINE',
        ...(video ? { videoId: video } : {}),
        ...range,
        breakdown,
        ...(countryCode ? { country: countryCode } : {}),
        columns: (table.columnHeaders ?? []).map((h) => h.name),
        rows,
        rowCount: rows.length,
        ...(rows.length === 0
          ? { note: 'No demographic data: too few signed-in viewers in this range.' }
          : {}),
      };
    },
  });
}
