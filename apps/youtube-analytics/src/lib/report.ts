/**
 * YouTube Analytics `reports.query` and the compact result shape every report tool returns.
 *
 * Results are a table (`columns` + `rows` as arrays) rather than one object per row: a
 * year of daily data stays a few thousand characters per metric. A final size check keeps
 * every result under the SDK's 50,000-character limit and says how to get the rest.
 */

import type { Args } from './args.js';
import {
  bad,
  channelId,
  country,
  dateRange,
  daysBetween,
  metricList,
  toMonthRange,
} from './args.js';
import { ANALYTICS_BASE_URL, apiGet, type ClientContext } from './client.js';

/** Results stop growing at this many characters (the SDK truncates above 50,000). */
export const RESULT_BUDGET_CHARS = 45_000;
/** Longest range for daily rows; longer ranges should use groupBy month. */
export const MAX_DAILY_RANGE_DAYS = 400;

export interface ColumnHeader {
  name: string;
  columnType: 'DIMENSION' | 'METRIC' | string;
  dataType: string;
}

export interface ResultTable {
  kind?: string;
  columnHeaders?: ColumnHeader[];
  rows?: Array<Array<string | number | null>>;
}

export interface ReportQuery {
  channelId?: string;
  startDate: string;
  endDate: string;
  metrics: string[];
  dimensions?: string[];
  filters?: string[];
  sort?: string;
  maxResults?: number;
  startIndex?: number;
  /** Overall deadline; the health check uses a short one. */
  timeoutMs?: number;
}

/** `ids` for the query: the connected account's channel, or one it owns or manages. */
export function idsFor(channel: string | undefined): string {
  return channel ? `channel==${channel}` : 'channel==MINE';
}

export async function queryReport(ctx: ClientContext, q: ReportQuery): Promise<ResultTable> {
  return apiGet<ResultTable>(ANALYTICS_BASE_URL, '/reports', ctx, {
    params: {
      ids: idsFor(q.channelId),
      startDate: q.startDate,
      endDate: q.endDate,
      metrics: q.metrics.join(','),
      dimensions: q.dimensions?.length ? q.dimensions.join(',') : undefined,
      filters: q.filters?.length ? q.filters.join(';') : undefined,
      sort: q.sort,
      maxResults: q.maxResults,
      startIndex: q.startIndex,
    },
    timeoutMs: q.timeoutMs,
  });
}

/**
 * Shapes a result table: `totals` when there are no dimensions, otherwise `columns` and
 * `rows`, cut to the size budget. `nextStartIndex` is set when more rows may exist.
 */
export function shapeTable(
  base: Record<string, unknown>,
  table: ResultTable,
  page: { startIndex?: number; maxResults?: number } = {},
): Record<string, unknown> {
  const headers = table.columnHeaders ?? [];
  const columns = headers.map((h) => h.name);
  const rows = table.rows ?? [];
  const hasDimensions = headers.some((h) => h.columnType === 'DIMENSION');

  if (!hasDimensions) {
    const totals: Record<string, string | number | null> = {};
    columns.forEach((name, i) => {
      totals[name] = rows[0]?.[i] ?? null;
    });
    return { ...base, totals, ...(rows.length === 0 ? { note: 'No data for this range.' } : {}) };
  }

  const startIndex = page.startIndex ?? 1;
  const kept: typeof rows = [];
  let size = JSON.stringify({ ...base, columns, rows: [], rowCount: 0 }).length + 200;
  let limitApplied = false;
  for (const row of rows) {
    const rowSize = JSON.stringify(row).length + 1;
    if (size + rowSize > RESULT_BUDGET_CHARS) {
      limitApplied = true;
      break;
    }
    size += rowSize;
    kept.push(row);
  }

  const result: Record<string, unknown> = { ...base, columns, rows: kept, rowCount: kept.length };
  if (limitApplied) {
    result.limitApplied = true;
    result.nextStartIndex = startIndex + kept.length;
    result.note =
      'Result cut to stay under 50,000 characters. Narrow the date range, request fewer metrics, ' +
      'or pass startIndex to read the next rows.';
  } else if (page.maxResults !== undefined && rows.length >= page.maxResults) {
    result.nextStartIndex = startIndex + rows.length;
  }
  if (kept.length === 0 && !limitApplied) result.note = 'No data for this range.';
  return result;
}

// ---------------------------------------------------------------------------
// The breakdown report behind get-channel-report and get-video-report
// ---------------------------------------------------------------------------

export const GROUP_BY = {
  none: [],
  day: ['day'],
  month: ['month'],
  country: ['country'],
  contentType: ['creatorContentType'],
  trafficSource: ['insightTrafficSourceType'],
  deviceType: ['deviceType'],
  operatingSystem: ['operatingSystem'],
} as const satisfies Record<string, readonly string[]>;

export type GroupBy = keyof typeof GROUP_BY;
export const GROUP_BY_NAMES = Object.keys(GROUP_BY) as GroupBy[];

/** Breakdowns by how people watch accept only views-style metrics. */
const PLAYBACK_GROUPS: ReadonlySet<GroupBy> = new Set([
  'trafficSource',
  'deviceType',
  'operatingSystem',
]);

export const CORE_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'averageViewPercentage',
  'subscribersGained',
  'subscribersLost',
  'likes',
  'comments',
  'shares',
];
export const PLAYBACK_METRICS = ['views', 'estimatedMinutesWatched'];

export const REPORT_PARAMETERS = {
  startDate: {
    type: 'string',
    description:
      'First day, YYYY-MM-DD (Pacific time). Default: 27 days before endDate (a 28-day window).',
  },
  endDate: {
    type: 'string',
    description:
      'Last day, YYYY-MM-DD. Default: today. The last 2-3 days are usually still incomplete.',
  },
  groupBy: {
    type: 'string',
    enum: GROUP_BY_NAMES,
    description:
      'How to break the numbers down. none = totals for the range; day (at most 400 days) and ' +
      'month = time series; country; contentType (videos, Shorts, live streams); trafficSource ' +
      '(YT_SEARCH, SUGGESTED via RELATED_VIDEO, EXT_URL...); deviceType; operatingSystem. Default none.',
  },
  metrics: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Metric API names. Default for none/day/month/country/contentType: views, ' +
      'estimatedMinutesWatched, averageViewDuration (seconds), averageViewPercentage, ' +
      'subscribersGained, subscribersLost, likes, comments, shares. trafficSource, deviceType ' +
      'and operatingSystem accept only views, engagedViews and estimatedMinutesWatched.',
  },
  country: {
    type: 'string',
    description: 'Only count viewers in this country (ISO 3166-1 alpha-2, e.g. US, ES).',
  },
  maxResults: {
    type: 'integer',
    minimum: 1,
    maximum: 200,
    description:
      'For country, trafficSource, deviceType and operatingSystem: rows to return, sorted by views (default 50).',
  },
} as const;

/** Runs a breakdown report for the channel, or for one video when `video` is set. */
export async function breakdownReport(
  ctx: ClientContext,
  a: Args,
  video?: string,
): Promise<Record<string, unknown>> {
  const groupByRaw = a.groupBy ?? 'none';
  if (typeof groupByRaw !== 'string' || !(groupByRaw in GROUP_BY)) {
    throw bad(
      `groupBy must be one of ${GROUP_BY_NAMES.join(', ')}; got ${JSON.stringify(groupByRaw)}.`,
    );
  }
  const groupBy = groupByRaw as GroupBy;
  const channel = channelId(a);
  let range = dateRange(a);
  if (groupBy === 'day' && daysBetween(range.startDate, range.endDate) + 1 > MAX_DAILY_RANGE_DAYS) {
    throw bad(
      `groupBy day covers at most ${MAX_DAILY_RANGE_DAYS} days; ${range.startDate}..${range.endDate} is longer. Use groupBy month for longer ranges.`,
    );
  }
  // The API requires both dates on the first day of the month for monthly rows.
  if (groupBy === 'month') range = toMonthRange(range);

  const playback = PLAYBACK_GROUPS.has(groupBy);
  const metrics = metricList(a, 'metrics', playback ? PLAYBACK_METRICS : CORE_METRICS);
  const filters: string[] = [];
  if (video) filters.push(`video==${video}`);
  const countryCode = country(a);
  if (countryCode) {
    if (groupBy === 'country') throw bad('country cannot be combined with groupBy country.');
    filters.push(`country==${countryCode}`);
  }

  const dimensions = [...GROUP_BY[groupBy]];
  const timeSeries = groupBy === 'day' || groupBy === 'month';
  const ranked = dimensions.length > 0 && !timeSeries;
  let maxResults: number | undefined;
  if (ranked) {
    const raw = a.maxResults ?? 50;
    const n = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 200) {
      throw bad(
        `maxResults must be an integer from 1 to 200; got ${JSON.stringify(a.maxResults)}.`,
      );
    }
    maxResults = n;
  }
  const sortMetric = metrics.includes('views') ? 'views' : metrics[0];
  const sort = timeSeries ? dimensions[0] : ranked ? `-${sortMetric}` : undefined;

  const table = await queryReport(ctx, {
    channelId: channel,
    ...range,
    metrics,
    dimensions,
    filters,
    sort,
    maxResults,
  });
  const base: Record<string, unknown> = {
    channel: channel ?? 'MINE',
    ...(video ? { videoId: video } : {}),
    startDate: range.startDate,
    endDate: range.endDate,
    groupBy,
    ...(countryCode ? { country: countryCode } : {}),
  };
  // No paging here: ranked breakdowns are capped by maxResults, time series by the range.
  return shapeTable(base, table);
}
