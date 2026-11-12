import type { AgentApp } from '@agentapps/sdk';
import { bad, channelId, dateRange, intInRange, metricList, optionalString } from '../lib/args.js';
import { queryReport, shapeTable } from '../lib/report.js';

const NAME_LIST = /^[A-Za-z][A-Za-z0-9]*(,[A-Za-z][A-Za-z0-9]*)*$/;
const SORT = /^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$/;
// Filters look like `country==US;video==id1,id2`: names, values, `==`, `,` and `;` only.
const FILTERS =
  /^[A-Za-z][A-Za-z0-9]*==[A-Za-z0-9_.,-]+(;[A-Za-z][A-Za-z0-9]*==[A-Za-z0-9_.,-]+)*$/;

function nameList(value: unknown, key: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = Array.isArray(value)
    ? value.map((v) => String(v).trim()).join(',')
    : String(value).replace(/\s+/g, '');
  if (!NAME_LIST.test(text))
    throw bad(
      `${key} must be comma-separated API names such as day,country; got ${JSON.stringify(value)}.`,
    );
  return text;
}

export function registerRunReportTool(app: AgentApp): void {
  app.tool('run-report', {
    description:
      'Run any YouTube Analytics query (reports.query) for the channel when the focused report ' +
      'tools do not cover it: choose metrics, dimensions, filters and sort yourself. Example: ' +
      'dimensions insightPlaybackLocationType (where videos were watched), or dimensions ' +
      'sharingService with metric shares. Only some metric/dimension combinations are valid (see ' +
      'https://developers.google.com/youtube/analytics/channel_reports); an invalid one returns ' +
      '[BAD_REQUEST] with the API’s reason. Revenue metrics are not available (the app does not ' +
      'request the monetary scope). Returns { columns, rows } or { totals } without dimensions; ' +
      'pass nextStartIndex back as startIndex to page.',
    parameters: {
      type: 'object',
      properties: {
        metrics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Metric API names, e.g. ["views","estimatedMinutesWatched"].',
        },
        dimensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Dimension API names, e.g. ["day"] or ["insightPlaybackLocationType"].',
        },
        filters: {
          type: 'string',
          description:
            'Filters in API syntax, joined with ";": country==US;video==VIDEO_ID1,VIDEO_ID2.',
        },
        sort: {
          type: 'string',
          description:
            'Comma-separated dimensions or metrics; prefix "-" for descending, e.g. -views.',
        },
        startDate: {
          type: 'string',
          description: 'First day, YYYY-MM-DD. Default: 27 days before endDate.',
        },
        endDate: { type: 'string', description: 'Last day, YYYY-MM-DD. Default: today.' },
        maxResults: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description:
            'Maximum rows (1-1000). Some reports (dimension video) require 200 or less and a sort.',
        },
        startIndex: {
          type: 'integer',
          minimum: 1,
          description: '1-based index of the first row, for paging.',
        },
        channelId: {
          type: 'string',
          description: 'Channel id (UC...). Default: the connected account’s channel.',
        },
      },
      required: ['metrics'],
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
      const metrics = metricList(a, 'metrics', []);
      if (metrics.length === 0) throw bad('metrics is required, e.g. ["views"].');
      const dimensions = nameList(a.dimensions, 'dimensions');
      const filters = optionalString(a, 'filters', 2_000);
      if (filters !== undefined && !FILTERS.test(filters)) {
        throw bad(
          `filters must look like country==US;video==VIDEO_ID; got ${JSON.stringify(filters)}.`,
        );
      }
      const sort = optionalString(a, 'sort', 200)?.replace(/\s*,\s*/g, ',');
      if (sort !== undefined && !SORT.test(sort)) {
        throw bad(
          `sort must be comma-separated names, "-" for descending; got ${JSON.stringify(sort)}.`,
        );
      }
      const maxResults =
        a.maxResults === undefined ? undefined : intInRange(a, 'maxResults', 1, 1000, 1);
      const startIndex = intInRange(a, 'startIndex', 1, 1_000_000, 1);
      const range = dateRange(a);
      const channel = channelId(a);

      const table = await queryReport(ctx, {
        channelId: channel,
        ...range,
        metrics,
        dimensions: dimensions ? dimensions.split(',') : [],
        filters: filters ? [filters] : [],
        sort,
        maxResults,
        startIndex: startIndex === 1 ? undefined : startIndex,
      });
      return shapeTable({ channel: channel ?? 'MINE', ...range }, table, {
        startIndex,
        maxResults,
      });
    },
  });
}
