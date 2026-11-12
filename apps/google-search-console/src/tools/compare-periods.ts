import type { AgentApp } from '@agentapps/sdk';
import {
  type ApiRow,
  buildBody,
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
  type DateRange,
  daysBetween,
  MAX_RESULT_CHARS,
  parseDateRange,
  parseEnum,
  parseInteger,
  parseSiteUrl,
  shiftDate,
} from '../lib/args.js';
import { READ } from './annotations.js';

const GROUPS = ['query', 'page', 'country', 'device', 'searchAppearance'] as const;
const COMPARE_TO = ['previous_period', 'previous_year'] as const;
const SORTS = ['biggest_change', 'losses', 'gains'] as const;
/** Rows fetched per period: keys outside the top rows of a period look new or lost. */
const SOURCE_ROWS = 5_000;
const MAX_LIMIT = 100;

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

function totalsOf(rows: ApiRow[] | undefined) {
  const row = rows?.[0];
  return row ? metrics(row) : { clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

export function registerComparePeriodsTool(app: AgentApp): void {
  app.tool('compare-periods', {
    description:
      'Compare Search Console performance between two periods to find what gained or lost ' +
      'traffic. Groups by one dimension (query by default, or page, country, device, ' +
      'searchAppearance) and compares the current range (default the last 28 days of final ' +
      'data) with the period right before it (compareTo previous_period) or 52 weeks earlier ' +
      '(previous_year, same weekdays). Returns { current, previous } totals and items: [{ key, ' +
      'clicks, previousClicks, clicksChange, impressions, previousImpressions, ' +
      'impressionsChange, ctr, previousCtr, position, previousPosition, positionChange }], ' +
      'sorted by the largest click change (or only losses / gains). A negative positionChange ' +
      'means the ranking improved. Only the top 5,000 keys of each period are compared.',
    parameters: {
      type: 'object',
      properties: {
        siteUrl: {
          type: 'string',
          description: 'Property exactly as list-sites returns it (sc-domain:... or https://.../).',
        },
        ...RANGE_SCHEMA,
        dimension: {
          type: 'string',
          enum: [...GROUPS],
          description: 'What to compare (default query).',
        },
        compareTo: {
          type: 'string',
          enum: [...COMPARE_TO],
          description:
            'previous_period (default): the same number of days right before; previous_year: ' +
            'the same range 364 days earlier.',
        },
        sortBy: {
          type: 'string',
          enum: [...SORTS],
          description:
            'biggest_change (default): largest absolute click change; losses: biggest drops ' +
            'only; gains: biggest increases only.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIMIT,
          description: `Items to return (default 25, max ${MAX_LIMIT}).`,
        },
        type: {
          type: 'string',
          enum: [...SEARCH_TYPES],
          description: 'Search type (default web).',
        },
        filters: FILTERS_SCHEMA,
      },
      required: ['siteUrl'],
    },
    annotations: READ,
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const siteUrl = parseSiteUrl(a.siteUrl);
      const current = parseDateRange(a, 28);
      const dimension = parseEnum('dimension', a.dimension, GROUPS, 'query');
      const compareTo = parseEnum('compareTo', a.compareTo, COMPARE_TO, 'previous_period');
      const sortBy = parseEnum('sortBy', a.sortBy, SORTS, 'biggest_change');
      const limit = parseInteger('limit', a.limit, 1, MAX_LIMIT, 25);
      const type = parseEnum('type', a.type, SEARCH_TYPES, 'web');
      const filters = parseFilters(a.filters);

      const shift =
        compareTo === 'previous_year' ? -364 : -daysBetween(current.startDate, current.endDate);
      const previous: DateRange = {
        startDate: shiftDate(current.startDate, shift),
        endDate: shiftDate(current.endDate, shift),
      };

      const grouped = (range: DateRange) =>
        runQuery(
          ctx,
          siteUrl,
          buildBody({ ...range, dimensions: [dimension], type, rowLimit: SOURCE_ROWS }, filters),
        );
      const totals = (range: DateRange) =>
        runQuery(ctx, siteUrl, buildBody({ ...range, type }, filters));
      const [curRows, prevRows, curTotals, prevTotals] = await Promise.all([
        grouped(current),
        grouped(previous),
        totals(current),
        totals(previous),
      ]);

      const before = new Map<string, ReturnType<typeof metrics>>();
      for (const r of prevRows?.rows ?? []) before.set(r.keys?.[0] ?? '', metrics(r));
      const after = new Map<string, ReturnType<typeof metrics>>();
      for (const r of curRows?.rows ?? []) after.set(r.keys?.[0] ?? '', metrics(r));

      const empty = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      const keys = new Set([...after.keys(), ...before.keys()]);
      let items = [...keys].map((key) => {
        const now = after.get(key) ?? empty;
        const then = before.get(key) ?? empty;
        return {
          key,
          clicks: now.clicks,
          previousClicks: then.clicks,
          clicksChange: now.clicks - then.clicks,
          impressions: now.impressions,
          previousImpressions: then.impressions,
          impressionsChange: now.impressions - then.impressions,
          ctr: now.ctr,
          previousCtr: then.ctr,
          position: now.position,
          previousPosition: then.position,
          // Position 0 means "not in that period's top rows": no meaningful change.
          positionChange:
            now.position && then.position ? round(now.position - then.position, 2) : null,
        };
      });
      if (sortBy === 'losses') items = items.filter((i) => i.clicksChange < 0);
      if (sortBy === 'gains') items = items.filter((i) => i.clicksChange > 0);
      items.sort(
        (x, y) =>
          (sortBy === 'gains'
            ? y.clicksChange - x.clicksChange
            : sortBy === 'losses'
              ? x.clicksChange - y.clicksChange
              : Math.abs(y.clicksChange) - Math.abs(x.clicksChange)) ||
          Math.abs(y.impressionsChange) - Math.abs(x.impressionsChange),
      );
      const { kept, limitApplied } = fitToBudget(items.slice(0, limit), MAX_RESULT_CHARS - 2_000);

      const sourceCapped =
        (curRows?.rows?.length ?? 0) >= SOURCE_ROWS || (prevRows?.rows?.length ?? 0) >= SOURCE_ROWS;
      return {
        siteUrl,
        dimension,
        type,
        current: { ...current, ...totalsOf(curTotals?.rows) },
        previous: { ...previous, ...totalsOf(prevTotals?.rows) },
        items: kept,
        ...(limitApplied ? { limitApplied: true } : {}),
        ...(sourceCapped
          ? {
              note: `A period has more than ${SOURCE_ROWS} ${dimension} rows; keys outside the top ${SOURCE_ROWS} of a period count as 0 there. Add filters to narrow the comparison.`,
            }
          : {}),
      };
    },
  });
}
