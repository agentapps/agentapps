import type { AgentApp } from '@agentapps/sdk';
import { READ } from '../tools/annotations.js';
import {
  buildBody,
  type Filter,
  fitToBudget,
  metrics,
  RANGE_SCHEMA,
  runQuery,
  SEARCH_TYPES,
  SHORTCUT_SCHEMA,
  shortcutFilters,
} from './analytics.js';
import {
  type Args,
  MAX_RESULT_CHARS,
  optionalString,
  parseDateRange,
  parseEnum,
  parseInteger,
  parseSiteUrl,
} from './args.js';

const MAX_LIMIT = 250;

/**
 * get-top-queries and get-top-pages: the two questions asked most often of the
 * Performance report, with the date range and filters reduced to a few shortcuts.
 * Both are thin presets over the same Search Analytics request.
 */
export function registerTopTool(app: AgentApp, kind: 'query' | 'page'): void {
  const other = kind === 'query' ? 'page' : 'query';
  const plural = kind === 'query' ? 'queries' : 'pages';
  app.tool(`get-top-${plural}`, {
    description:
      kind === 'query'
        ? 'Top search queries of a property by clicks for a date range (default the last 28 ' +
          'days of final data). Returns { items: [{ query, clicks, impressions, ctr, position }] } ' +
          'sorted by clicks. Optionally only for one page (page: exact URL), queries containing ' +
          'a text, one country or device. For other groupings or paging use ' +
          'query-search-analytics.'
        : 'Top pages of a property by clicks from Google Search for a date range (default the ' +
          'last 28 days of final data). Returns { items: [{ page, clicks, impressions, ctr, ' +
          'position }] } sorted by clicks. Optionally only for one query (query: exact text), ' +
          'pages whose URL contains a text, one country or device. Use inspect-url on a page to ' +
          'check its index status.',
    parameters: {
      type: 'object',
      properties: {
        siteUrl: {
          type: 'string',
          description: 'Property exactly as list-sites returns it (sc-domain:... or https://.../).',
        },
        ...RANGE_SCHEMA,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIMIT,
          description: `How many ${plural} (default 25, max ${MAX_LIMIT}).`,
        },
        [`${kind}Contains`]: {
          type: 'string',
          description: `Only ${plural} containing this text (case-insensitive).`,
        },
        [other]: {
          type: 'string',
          description:
            kind === 'query'
              ? 'Only queries that led to this page (exact URL).'
              : 'Only pages shown for this query (exact, case-sensitive).',
        },
        ...SHORTCUT_SCHEMA,
      },
      required: ['siteUrl'],
    },
    annotations: READ,
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const siteUrl = parseSiteUrl(a.siteUrl);
      const range = parseDateRange(a, 28);
      const limit = parseInteger('limit', a.limit, 1, MAX_LIMIT, 25);
      const type = parseEnum('type', a.type, SEARCH_TYPES, 'web');
      const filters: Filter[] = shortcutFilters(a);
      const contains = optionalString(`${kind}Contains`, a[`${kind}Contains`]);
      if (contains) filters.push({ dimension: kind, operator: 'contains', expression: contains });
      const exact = optionalString(other, a[other]);
      if (exact) filters.push({ dimension: other, operator: 'equals', expression: exact });

      const response = await runQuery(
        ctx,
        siteUrl,
        buildBody({ ...range, dimensions: [kind], type, rowLimit: limit }, filters),
      );
      const items = (response?.rows ?? []).map((r) => ({
        [kind]: r.keys?.[0] ?? '',
        ...metrics(r),
      }));
      const { kept, limitApplied } = fitToBudget(items, MAX_RESULT_CHARS - 1_000);
      return {
        siteUrl,
        ...range,
        type,
        items: kept,
        ...(limitApplied ? { limitApplied: true } : {}),
      };
    },
  });
}
