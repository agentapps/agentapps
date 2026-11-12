import type { AgentApp } from '@agentapps/sdk';
import {
  buildBody,
  DIMENSIONS,
  type Dimension,
  FILTERS_SCHEMA,
  fitToBudget,
  metrics,
  parseFilters,
  RANGE_SCHEMA,
  runQuery,
  SEARCH_TYPES,
} from '../lib/analytics.js';
import {
  type Args,
  bad,
  MAX_RESULT_CHARS,
  parseDateRange,
  parseEnum,
  parseInteger,
  parseSiteUrl,
} from '../lib/args.js';
import { READ } from './annotations.js';

const AGGREGATION_TYPES = ['auto', 'byPage', 'byProperty', 'byNewsShowcasePanel'] as const;
const DATA_STATES = ['final', 'all', 'hourly_all'] as const;
const MAX_ROW_LIMIT = 5_000;
/** Room left in the result for everything that is not a row. */
const ROWS_BUDGET = MAX_RESULT_CHARS - 2_000;

function parseDimensions(value: unknown): Dimension[] {
  if (value === undefined || value === null || value === '') return [];
  const list = typeof value === 'string' ? value.split(',').map((s) => s.trim()) : value;
  if (!Array.isArray(list)) throw bad(`dimensions must be an array of ${DIMENSIONS.join(', ')}.`);
  const dims = list.map((d, i) => parseEnum(`dimensions[${i}]`, d, DIMENSIONS) as Dimension);
  if (new Set(dims).size !== dims.length) throw bad('dimensions must not repeat a dimension.');
  return dims;
}

export function registerQuerySearchAnalyticsTool(app: AgentApp): void {
  app.tool('query-search-analytics', {
    description:
      'Query the Search Console Performance report (Search Analytics) of one property: clicks, ' +
      'impressions, ctr (0-1) and average position, grouped by any of query, page, country, ' +
      'device, searchAppearance, date, hour, with filters. Returns { columns, rows, rowCount, ' +
      'startRow, hasMore, nextStartRow, limitApplied } where each row is an array in the order ' +
      'of columns (the dimensions, then clicks, impressions, ctr, position). Rows come sorted ' +
      'by clicks descending (by date when grouped by date). Page through with ' +
      'startRow: nextStartRow. Data is in Pacific Time, lags about 2-3 days for final data and ' +
      'goes back about 16 months; Google returns top rows only, not every long-tail row. For ' +
      'quick answers use get-top-queries or get-top-pages; to find what changed use ' +
      'compare-periods.',
    parameters: {
      type: 'object',
      properties: {
        siteUrl: {
          type: 'string',
          description: 'Property exactly as list-sites returns it (sc-domain:... or https://.../).',
        },
        ...RANGE_SCHEMA,
        dimensions: {
          type: 'array',
          items: { type: 'string', enum: [...DIMENSIONS] },
          description:
            'Group by these, in this order (none: one total row). "hour" needs recent data and ' +
            'switches dataState to hourly_all.',
        },
        type: {
          type: 'string',
          enum: [...SEARCH_TYPES],
          description:
            'Search type (default web: the "All" tab, without Discover and Google News).',
        },
        filters: FILTERS_SCHEMA,
        aggregationType: {
          type: 'string',
          enum: [...AGGREGATION_TYPES],
          description:
            'auto (default), byPage or byProperty. Grouping or filtering by page requires auto.',
        },
        dataState: {
          type: 'string',
          enum: [...DATA_STATES],
          description:
            'final (default): finalized data only; all: include fresh, still-changing data; ' +
            'hourly_all: hourly breakdown (with the hour dimension).',
        },
        rowLimit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_ROW_LIMIT,
          description: `Rows to request (default 100, max ${MAX_ROW_LIMIT}). Fewer are returned if the result would exceed the size limit.`,
        },
        startRow: {
          type: 'integer',
          minimum: 0,
          description: 'Zero-based offset for paging (default 0); use nextStartRow.',
        },
      },
      required: ['siteUrl'],
    },
    annotations: READ,
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const siteUrl = parseSiteUrl(a.siteUrl);
      const range = parseDateRange(a, 28);
      const dimensions = parseDimensions(a.dimensions);
      const type = parseEnum('type', a.type, SEARCH_TYPES, 'web');
      const filters = parseFilters(a.filters);
      const aggregationType = parseEnum('aggregationType', a.aggregationType, AGGREGATION_TYPES);
      const dataState = parseEnum(
        'dataState',
        a.dataState,
        DATA_STATES,
        dimensions.includes('hour') ? 'hourly_all' : 'final',
      );
      const rowLimit = parseInteger('rowLimit', a.rowLimit, 1, MAX_ROW_LIMIT, 100);
      const startRow = parseInteger('startRow', a.startRow, 0, Number.MAX_SAFE_INTEGER, 0);

      const response = await runQuery(
        ctx,
        siteUrl,
        buildBody(
          { ...range, dimensions, type, aggregationType, dataState, rowLimit, startRow },
          filters,
        ),
      );

      const apiRows = response?.rows ?? [];
      const rows = apiRows.map((r) => {
        const m = metrics(r);
        return [...(r.keys ?? []), m.clicks, m.impressions, m.ctr, m.position];
      });
      const { kept, limitApplied } = fitToBudget(rows, ROWS_BUDGET);
      // A full page means Google may have more rows after it.
      const hasMore = limitApplied || apiRows.length === rowLimit;
      return {
        siteUrl,
        ...range,
        type,
        dataState,
        columns: [...dimensions, 'clicks', 'impressions', 'ctr', 'position'],
        rows: kept,
        rowCount: kept.length,
        startRow,
        hasMore,
        ...(hasMore ? { nextStartRow: startRow + kept.length } : {}),
        ...(limitApplied ? { limitApplied: true } : {}),
        ...(response?.responseAggregationType
          ? { responseAggregationType: response.responseAggregationType }
          : {}),
        ...(response?.metadata?.first_incomplete_date
          ? { firstIncompleteDate: response.metadata.first_incomplete_date }
          : {}),
        ...(response?.metadata?.first_incomplete_hour
          ? { firstIncompleteHour: response.metadata.first_incomplete_hour }
          : {}),
      };
    },
  });
}
