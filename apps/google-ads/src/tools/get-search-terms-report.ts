import type { AgentApp } from '@agentapps/sdk';
import {
  CUSTOMER_ID_SCHEMA,
  DATE_RANGE_SCHEMA,
  LOGIN_CUSTOMER_ID_SCHEMA,
  parseCustomerId,
  parseDateRange,
  parseEnum,
  parseInteger,
  parseOptionalCustomerId,
  parseOptionalId,
} from '../lib/args.js';
import { METRIC_FIELDS, metricsOf, search, withinBudget } from '../lib/gaql.js';
import { ORDER_BY, ORDER_FIELDS } from './get-performance-report.js';

export function registerGetSearchTermsReportTool(app: AgentApp): void {
  app.tool('get-search-terms-report', {
    description:
      'Search terms report: the real queries people typed that triggered Search ads, with the keyword that matched and their performance. ' +
      'Returns { currency, dateRange, rows: [{ searchTerm, status, campaignId, campaignName, adGroupId, adGroupName, keyword, matchType, impressions, clicks, ctr, averageCpc, cost, conversions, conversionsValue, costPerConversion }], limitApplied }. ' +
      'status ADDED / EXCLUDED tells whether the term is already a keyword or a negative. ' +
      'Typical use: find terms with cost and no conversions, then block them with add-negative-keywords. ' +
      'Covers Search and Shopping campaigns (Performance Max search terms are not in this report); terms with very low volume are hidden by Google for privacy.',
    parameters: {
      type: 'object',
      properties: {
        customerId: CUSTOMER_ID_SCHEMA,
        loginCustomerId: LOGIN_CUSTOMER_ID_SCHEMA,
        ...DATE_RANGE_SCHEMA,
        campaignId: {
          type: ['string', 'number'],
          description: 'Optional. Only this campaign.',
        },
        adGroupId: {
          type: ['string', 'number'],
          description: 'Optional. Only this ad group.',
        },
        minClicks: {
          type: 'integer',
          minimum: 0,
          description: 'Optional. Only terms with at least this many clicks (default 0).',
        },
        orderBy: {
          type: 'string',
          enum: ORDER_BY,
          description: 'Sort key, descending (default COST).',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Maximum rows (default 100, max 500).',
        },
      },
      required: ['customerId'],
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
      const customerId = parseCustomerId(a.customerId);
      const loginCustomerId = parseOptionalCustomerId(a.loginCustomerId, 'loginCustomerId');
      const range = parseDateRange(a);
      const campaignId = parseOptionalId(a.campaignId, 'campaignId');
      const adGroupId = parseOptionalId(a.adGroupId, 'adGroupId');
      const minClicks = parseInteger(a.minClicks, 'minClicks', {
        min: 0,
        max: 1_000_000_000,
        fallback: 0,
      });
      const orderBy = parseEnum(a.orderBy, 'orderBy', ORDER_BY, 'COST');
      const limit = parseInteger(a.limit, 'limit', { min: 1, max: 500, fallback: 100 });

      const select = [
        'search_term_view.search_term',
        'search_term_view.status',
        'campaign.id',
        'campaign.name',
        'ad_group.id',
        'ad_group.name',
        'segments.keyword.info.text',
        'segments.keyword.info.match_type',
        'customer.currency_code',
        ...METRIC_FIELDS,
      ];
      const where = [range.condition];
      if (campaignId) where.push(`campaign.id = ${campaignId}`);
      if (adGroupId) where.push(`ad_group.id = ${adGroupId}`);
      if (minClicks > 0) where.push(`metrics.clicks >= ${minClicks}`);
      const query =
        `SELECT ${select.join(', ')} FROM search_term_view WHERE ${where.join(' AND ')} ` +
        `ORDER BY ${ORDER_FIELDS[orderBy]} DESC LIMIT ${limit + 1}`;

      const page = await search(ctx, customerId, query, { loginCustomerId });
      const results = page.results ?? [];
      const rows = results.slice(0, limit).map((row) => ({
        searchTerm: row.searchTermView?.searchTerm ?? null,
        status: row.searchTermView?.status ?? null,
        campaignId: row.campaign?.id === undefined ? null : String(row.campaign.id),
        campaignName: row.campaign?.name ?? null,
        adGroupId: row.adGroup?.id === undefined ? null : String(row.adGroup.id),
        adGroupName: row.adGroup?.name ?? null,
        keyword: row.segments?.keyword?.info?.text ?? null,
        matchType: row.segments?.keyword?.info?.matchType ?? null,
        ...metricsOf(row),
      }));
      const { kept, cut } = withinBudget(rows);
      return {
        currency: results[0]?.customer?.currencyCode ?? null,
        dateRange: range.label,
        rows: kept,
        limitApplied: results.length > limit || cut,
      };
    },
  });
}
