/**
 * Search Analytics (the Performance report) helpers shared by query-search-analytics,
 * get-top-queries, get-top-pages and compare-periods.
 */

import { type Args, bad, parseEnum, sitePath } from './args.js';
import { apiRequest, type ClientContext } from './client.js';

export const DIMENSIONS = [
  'query',
  'page',
  'country',
  'device',
  'searchAppearance',
  'date',
  'hour',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const FILTER_DIMENSIONS = [
  'query',
  'page',
  'country',
  'device',
  'searchAppearance',
] as const;
export type FilterDimension = (typeof FILTER_DIMENSIONS)[number];

export const OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'includingRegex',
  'excludingRegex',
] as const;

export const SEARCH_TYPES = ['web', 'image', 'video', 'news', 'discover', 'googleNews'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const DEVICES = ['DESKTOP', 'MOBILE', 'TABLET'] as const;

const MAX_FILTERS = 10;

export interface Filter {
  dimension: FilterDimension;
  operator: (typeof OPERATORS)[number];
  expression: string;
}

/** JSON Schema of one filter, shared by the tools that accept `filters`. */
export const FILTERS_SCHEMA = {
  type: 'array',
  maxItems: MAX_FILTERS,
  description:
    'Filters, all of which must match (AND). Each is { dimension, operator, expression }. ' +
    'dimension: query, page, country (ISO 3166-1 alpha-3, lowercase, e.g. "esp"), device ' +
    '(DESKTOP, MOBILE, TABLET) or searchAppearance. operator: equals (default, case-sensitive ' +
    'for query and page), notEquals, contains, notContains (case-insensitive), includingRegex, ' +
    'excludingRegex (RE2). A dimension can be filtered without grouping by it.',
  items: {
    type: 'object',
    properties: {
      dimension: { type: 'string', enum: [...FILTER_DIMENSIONS] },
      operator: { type: 'string', enum: [...OPERATORS] },
      expression: { type: 'string', description: 'The value or pattern to match.' },
    },
    required: ['dimension', 'expression'],
  },
} as const;

/** Date-range properties shared by every Search Analytics tool. */
export const RANGE_SCHEMA = {
  startDate: {
    type: 'string',
    description: 'First day, YYYY-MM-DD, Pacific Time. Overrides days.',
  },
  endDate: {
    type: 'string',
    description:
      'Last day, YYYY-MM-DD, Pacific Time (default: 3 days ago, the latest day with final data).',
  },
  days: {
    type: 'integer',
    minimum: 1,
    maximum: 500,
    description: 'Length of the range ending at endDate when startDate is not given (default 28).',
  },
} as const;

export function parseFilters(value: unknown): Filter[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw bad('filters must be an array of { dimension, operator, expression }.');
  if (value.length > MAX_FILTERS) throw bad(`At most ${MAX_FILTERS} filters are allowed.`);
  return value.map((raw, i) => {
    const f = (raw ?? {}) as Args;
    const dimension = parseEnum(`filters[${i}].dimension`, f.dimension, FILTER_DIMENSIONS);
    if (!dimension) throw bad(`filters[${i}].dimension is required.`);
    const operator = parseEnum(`filters[${i}].operator`, f.operator, OPERATORS, 'equals');
    const expression =
      typeof f.expression === 'number' ? String(f.expression) : (f.expression as unknown);
    if (typeof expression !== 'string' || !expression) {
      throw bad(`filters[${i}].expression must be a non-empty string.`);
    }
    if (expression.length > 4096) throw bad(`filters[${i}].expression is over 4096 characters.`);
    return { dimension, operator, expression };
  });
}

/** Simple country/device shortcuts used by the helper tools, turned into filters. */
export function shortcutFilters(a: Args): Filter[] {
  const filters: Filter[] = [];
  if (a.country !== undefined && a.country !== null && a.country !== '') {
    const country = String(a.country).trim().toLowerCase();
    if (!/^[a-z]{3}$/.test(country)) {
      throw bad(
        `country must be an ISO 3166-1 alpha-3 code such as "esp" or "usa"; got ${JSON.stringify(a.country)}.`,
      );
    }
    filters.push({ dimension: 'country', operator: 'equals', expression: country });
  }
  const device = parseEnum(
    'device',
    typeof a.device === 'string' ? a.device.toUpperCase() : a.device,
    DEVICES,
  );
  if (device) filters.push({ dimension: 'device', operator: 'equals', expression: device });
  return filters;
}

export const SHORTCUT_SCHEMA = {
  country: {
    type: 'string',
    description: 'Only this country, ISO 3166-1 alpha-3 (e.g. "esp", "usa").',
  },
  device: { type: 'string', enum: [...DEVICES], description: 'Only this device class.' },
  type: {
    type: 'string',
    enum: [...SEARCH_TYPES],
    description: 'Search type (default web: the "All" tab, without Discover and Google News).',
  },
} as const;

export interface QueryBody {
  startDate: string;
  endDate: string;
  dimensions?: Dimension[];
  type?: SearchType;
  dimensionFilterGroups?: Array<{ groupType: 'and'; filters: Filter[] }>;
  aggregationType?: string;
  dataState?: string;
  rowLimit?: number;
  startRow?: number;
}

export interface ApiRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface QueryResponse {
  rows?: ApiRow[];
  responseAggregationType?: string;
  metadata?: { first_incomplete_date?: string; first_incomplete_hour?: string };
}

export function buildBody(
  base: Omit<QueryBody, 'dimensionFilterGroups'>,
  filters: Filter[],
): QueryBody {
  const body: QueryBody = { ...base };
  if (filters.length > 0) body.dimensionFilterGroups = [{ groupType: 'and', filters }];
  return body;
}

export function runQuery(ctx: ClientContext, siteUrl: string, body: QueryBody) {
  return apiRequest<QueryResponse>('POST', `${sitePath(siteUrl)}/searchAnalytics/query`, ctx, {
    body,
  });
}

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** Metrics with ctr (0-1) and position rounded to readable precision. */
export function metrics(row: Pick<ApiRow, 'clicks' | 'impressions' | 'ctr' | 'position'>) {
  return {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: round(row.ctr, 4),
    position: round(row.position, 2),
  };
}

/**
 * Adds items while their JSON stays under `budget` characters. Returns the kept items
 * and whether any were dropped, so the tool can report `limitApplied` with a cursor.
 */
export function fitToBudget<T>(items: T[], budget: number): { kept: T[]; limitApplied: boolean } {
  const kept: T[] = [];
  let size = 0;
  for (const item of items) {
    size += JSON.stringify(item).length + 1;
    if (size > budget) return { kept, limitApplied: true };
    kept.push(item);
  }
  return { kept, limitApplied: false };
}
