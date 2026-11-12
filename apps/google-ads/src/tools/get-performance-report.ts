import type { AgentApp } from '@agentapps/sdk';
import {
  CUSTOMER_ID_SCHEMA,
  DATE_RANGE_SCHEMA,
  LOGIN_CUSTOMER_ID_SCHEMA,
  parseBoolean,
  parseCustomerId,
  parseDateRange,
  parseEnum,
  parseInteger,
  parseOptionalCustomerId,
  parseOptionalId,
} from '../lib/args.js';
import { METRIC_FIELDS, metricsOf, type Row, search, withinBudget } from '../lib/gaql.js';

const LEVELS = ['CAMPAIGN', 'AD_GROUP', 'AD', 'KEYWORD'] as const;
type Level = (typeof LEVELS)[number];

export const ORDER_BY = ['COST', 'IMPRESSIONS', 'CLICKS', 'CONVERSIONS'] as const;
export const ORDER_FIELDS: Record<(typeof ORDER_BY)[number], string> = {
  COST: 'metrics.cost_micros',
  IMPRESSIONS: 'metrics.impressions',
  CLICKS: 'metrics.clicks',
  CONVERSIONS: 'metrics.conversions',
};

interface LevelSpec {
  from: string;
  fields: string[];
  /** Leaves out removed entities. */
  notRemoved: string[];
  describe(row: Row): Record<string, unknown>;
}

const str = (v: unknown) => (v === undefined || v === null ? null : String(v));

const campaignOf = (row: Row) => ({
  campaignId: str(row.campaign?.id),
  campaignName: row.campaign?.name ?? null,
});
const adGroupOf = (row: Row) => ({
  adGroupId: str(row.adGroup?.id),
  adGroupName: row.adGroup?.name ?? null,
});

const SPECS: Record<Level, LevelSpec> = {
  CAMPAIGN: {
    from: 'campaign',
    fields: [
      'campaign.id',
      'campaign.name',
      'campaign.status',
      'campaign.advertising_channel_type',
    ],
    notRemoved: ["campaign.status != 'REMOVED'"],
    describe: (row) => ({
      ...campaignOf(row),
      status: row.campaign?.status ?? null,
      channelType: row.campaign?.advertisingChannelType ?? null,
    }),
  },
  AD_GROUP: {
    from: 'ad_group',
    fields: [
      'campaign.id',
      'campaign.name',
      'ad_group.id',
      'ad_group.name',
      'ad_group.status',
      'ad_group.type',
    ],
    notRemoved: ["campaign.status != 'REMOVED'", "ad_group.status != 'REMOVED'"],
    describe: (row) => ({
      ...campaignOf(row),
      ...adGroupOf(row),
      status: row.adGroup?.status ?? null,
      type: row.adGroup?.type ?? null,
    }),
  },
  AD: {
    from: 'ad_group_ad',
    fields: [
      'campaign.id',
      'campaign.name',
      'ad_group.id',
      'ad_group.name',
      'ad_group_ad.ad.id',
      'ad_group_ad.ad.name',
      'ad_group_ad.ad.type',
      'ad_group_ad.status',
      'ad_group_ad.ad.final_urls',
      'ad_group_ad.ad.responsive_search_ad.headlines',
      'ad_group_ad.policy_summary.approval_status',
    ],
    notRemoved: [
      "campaign.status != 'REMOVED'",
      "ad_group.status != 'REMOVED'",
      "ad_group_ad.status != 'REMOVED'",
    ],
    describe: (row) => {
      const aga = row.adGroupAd ?? {};
      const headlines: Array<{ text?: string }> = aga.ad?.responsiveSearchAd?.headlines ?? [];
      return {
        ...campaignOf(row),
        ...adGroupOf(row),
        adId: str(aga.ad?.id),
        adName: aga.ad?.name ?? null,
        adType: aga.ad?.type ?? null,
        status: aga.status ?? null,
        approvalStatus: aga.policySummary?.approvalStatus ?? null,
        finalUrl: aga.ad?.finalUrls?.[0] ?? null,
        // The first three headlines are enough to recognise an ad and keep rows small.
        headlines: headlines.slice(0, 3).map((h) => h.text ?? ''),
      };
    },
  },
  KEYWORD: {
    from: 'keyword_view',
    fields: [
      'campaign.id',
      'campaign.name',
      'ad_group.id',
      'ad_group.name',
      'ad_group_criterion.criterion_id',
      'ad_group_criterion.keyword.text',
      'ad_group_criterion.keyword.match_type',
      'ad_group_criterion.status',
      'ad_group_criterion.quality_info.quality_score',
    ],
    notRemoved: [
      "campaign.status != 'REMOVED'",
      "ad_group.status != 'REMOVED'",
      "ad_group_criterion.status != 'REMOVED'",
      'ad_group_criterion.negative = FALSE',
    ],
    describe: (row) => {
      const k = row.adGroupCriterion ?? {};
      return {
        ...campaignOf(row),
        ...adGroupOf(row),
        criterionId: str(k.criterionId),
        keyword: k.keyword?.text ?? null,
        matchType: k.keyword?.matchType ?? null,
        status: k.status ?? null,
        qualityScore: k.qualityInfo?.qualityScore ?? null,
      };
    },
  },
};

export function registerGetPerformanceReportTool(app: AgentApp): void {
  app.tool('get-performance-report', {
    description:
      'Performance report of one Google Ads account at campaign, ad group, ad or keyword level for a date range. ' +
      'Returns { level, currency, dateRange, rows: [{ ...ids, names and status of the entity, impressions, clicks, ctr, averageCpc, cost, conversions, conversionsValue, costPerConversion, date? }], limitApplied }. ' +
      'Money is in the account currency; ctr is a fraction. Rows are ordered by cost (or orderBy), highest first; entities without traffic in the range are left out (list-campaigns lists all campaigns). ' +
      'Removed entities are excluded. Filter with campaignId / adGroupId; segmentByDate: true gives one row per entity per day. ' +
      'For other breakdowns (device, network, geography) use run-gaql-query.',
    parameters: {
      type: 'object',
      properties: {
        customerId: CUSTOMER_ID_SCHEMA,
        loginCustomerId: LOGIN_CUSTOMER_ID_SCHEMA,
        level: {
          type: 'string',
          enum: LEVELS,
          description:
            'CAMPAIGN (default), AD_GROUP, AD or KEYWORD (search keywords with quality score).',
        },
        ...DATE_RANGE_SCHEMA,
        campaignId: {
          type: ['string', 'number'],
          description: 'Optional. Only this campaign (numeric ID from list-campaigns).',
        },
        adGroupId: {
          type: ['string', 'number'],
          description: 'Optional. Only this ad group (AD_GROUP, AD and KEYWORD levels).',
        },
        segmentByDate: {
          type: 'boolean',
          description: 'Default false. One row per entity per day (adds a date field).',
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
          description: 'Maximum rows (default 50, max 500).',
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
      const level = parseEnum(a.level, 'level', LEVELS, 'CAMPAIGN');
      const range = parseDateRange(a);
      const campaignId = parseOptionalId(a.campaignId, 'campaignId');
      const adGroupId = parseOptionalId(a.adGroupId, 'adGroupId');
      if (adGroupId && level === 'CAMPAIGN') {
        throw new Error(
          '[BAD_REQUEST] adGroupId cannot filter a CAMPAIGN report; use level AD_GROUP, AD or KEYWORD.',
        );
      }
      const segmentByDate = parseBoolean(a.segmentByDate, 'segmentByDate', false);
      const orderBy = parseEnum(a.orderBy, 'orderBy', ORDER_BY, 'COST');
      const limit = parseInteger(a.limit, 'limit', { min: 1, max: 500, fallback: 50 });

      const spec = SPECS[level];
      const select = [...spec.fields, 'customer.currency_code', ...METRIC_FIELDS];
      if (segmentByDate) select.push('segments.date');
      const where = [range.condition, ...spec.notRemoved];
      if (campaignId) where.push(`campaign.id = ${campaignId}`);
      if (adGroupId) where.push(`ad_group.id = ${adGroupId}`);
      const query =
        `SELECT ${select.join(', ')} FROM ${spec.from} WHERE ${where.join(' AND ')} ` +
        `ORDER BY ${ORDER_FIELDS[orderBy]} DESC LIMIT ${limit + 1}`;

      const page = await search(ctx, customerId, query, { loginCustomerId });
      const results = page.results ?? [];
      const rows = results.slice(0, limit).map((row) => ({
        ...spec.describe(row),
        ...(segmentByDate ? { date: row.segments?.date ?? null } : {}),
        ...metricsOf(row),
      }));
      const { kept, cut } = withinBudget(rows);
      return {
        level,
        currency: results[0]?.customer?.currencyCode ?? null,
        dateRange: range.label,
        rows: kept,
        limitApplied: results.length > limit || cut,
      };
    },
  });
}
