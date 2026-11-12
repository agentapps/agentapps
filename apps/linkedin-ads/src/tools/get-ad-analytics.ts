import type { AgentApp } from '@agentapps/sdk';
import { type Args, bad, enumList, idList, isoDate, MAX_RESULT_CHARS } from '../lib/args.js';
import { apiRequest, restliDate, restliList, urn } from '../lib/client.js';

/** Pivots of the statistics finder (up to three at once). */
const PIVOTS = [
  'ACCOUNT',
  'CAMPAIGN_GROUP',
  'CAMPAIGN',
  'CREATIVE',
  'COMPANY',
  'SHARE',
  'CONVERSION',
  'OBJECTIVE_TYPE',
  'SERVING_LOCATION',
  'PLACEMENT_NAME',
  'IMPRESSION_DEVICE_TYPE',
] as const;
/** Professional demographic pivots: analytics finder only, one at a time. */
const MEMBER_PIVOTS = [
  'MEMBER_COMPANY',
  'MEMBER_COMPANY_SIZE',
  'MEMBER_INDUSTRY',
  'MEMBER_SENIORITY',
  'MEMBER_JOB_TITLE',
  'MEMBER_JOB_FUNCTION',
  'MEMBER_COUNTRY_V2',
  'MEMBER_REGION_V2',
] as const;
const ALL_PIVOTS = [...PIVOTS, ...MEMBER_PIVOTS] as const;
const GRANULARITIES = ['ALL', 'DAILY', 'MONTHLY', 'YEARLY'] as const;

const DEFAULT_METRICS = [
  'impressions',
  'clicks',
  'costInLocalCurrency',
  'landingPageClicks',
  'externalWebsiteConversions',
  'oneClickLeads',
  'totalEngagements',
];
/** LinkedIn accepts 20 fields; pivotValues and dateRange take two of them. */
const MAX_METRICS = 18;
const MAX_FACET_IDS = 20;
/** Days per granularity, so a time series stays bounded before the request is sent. */
const MAX_DAYS: Record<(typeof GRANULARITIES)[number], number> = {
  ALL: 3_660,
  DAILY: 92,
  MONTHLY: 1_098,
  YEARLY: 3_660,
};

type Row = Record<string, unknown>;

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
}

function isoFromRestli(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as { year?: number; month?: number; day?: number };
  if (!d.year || !d.month || !d.day) return null;
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

export function registerGetAdAnalyticsTool(app: AgentApp): void {
  app.tool('get-ad-analytics', {
    description:
      'Report LinkedIn ad performance (adAnalytics) for an ad account, campaign groups, ' +
      'campaigns or creatives over a date range, grouped by 1 to 3 pivots (CAMPAIGN, ' +
      'CREATIVE, ...) or by one professional demographic pivot (MEMBER_JOB_FUNCTION, ' +
      'MEMBER_COMPANY, ...). Returns columns: { pivots, timeGranularity, rowCount, columns: ' +
      '{ pivotValues: [[urn, ...]], start?: [date], end?: [date], <metric>: [values] }, ' +
      'limitApplied }. Default metrics: impressions, clicks, costInLocalCurrency (a decimal ' +
      'string in the account currency), landingPageClicks, externalWebsiteConversions, ' +
      'oneClickLeads, totalEngagements. pivotValues are URNs: match campaign ids with ' +
      'list-campaigns. Limits: DAILY covers at most 92 days, MONTHLY 36 months; demographic ' +
      'values are approximate, delayed 12-24 h and only the top 100 per creative per day. An ' +
      'empty result means no activity or no access.',
    parameters: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'First day, YYYY-MM-DD (UTC, inclusive).' },
        endDate: {
          type: 'string',
          description: 'Last day, YYYY-MM-DD (UTC, inclusive). Default: today.',
        },
        accountId: {
          type: ['string', 'number'],
          description:
            'Report on this whole ad account. Give exactly one of accountId, ' +
            'campaignGroupIds, campaignIds or creativeIds.',
        },
        campaignGroupIds: {
          type: 'array',
          items: { type: ['string', 'number'] },
          maxItems: MAX_FACET_IDS,
          description: 'Report on these campaign groups.',
        },
        campaignIds: {
          type: 'array',
          items: { type: ['string', 'number'] },
          maxItems: MAX_FACET_IDS,
          description: 'Report on these campaigns.',
        },
        creativeIds: {
          type: 'array',
          items: { type: ['string', 'number'] },
          maxItems: MAX_FACET_IDS,
          description: 'Report on these creatives (numeric creative ids from list-creatives).',
        },
        pivots: {
          type: 'array',
          items: { type: 'string', enum: [...ALL_PIVOTS] },
          minItems: 1,
          maxItems: 3,
          description:
            'How rows are grouped (default [CAMPAIGN]). Up to 3 non-demographic pivots, or ' +
            'exactly one MEMBER_* pivot.',
        },
        timeGranularity: {
          type: 'string',
          enum: [...GRANULARITIES],
          description: 'ALL (one row per pivot value, default), DAILY, MONTHLY or YEARLY.',
        },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_METRICS,
          description:
            'Metric field names (max 18), e.g. impressions, clicks, costInLocalCurrency, ' +
            'costInUsd, landingPageClicks, externalWebsiteConversions, oneClickLeads, ' +
            'qualifiedLeads, videoViews, videoCompletions, totalEngagements, ' +
            'approximateMemberReach (ranges of 92 days or less, non-demographic pivots).',
        },
      },
      required: ['startDate'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const startDate = isoDate(a.startDate, 'startDate');
      const endDate =
        a.endDate === undefined || a.endDate === null
          ? new Date().toISOString().slice(0, 10)
          : isoDate(a.endDate, 'endDate');
      if (endDate < startDate) throw bad('endDate must not be before startDate.');

      const [granularity = 'ALL'] = enumList(a.timeGranularity, 'timeGranularity', GRANULARITIES);
      const days = daysBetween(startDate, endDate);
      if (days > MAX_DAYS[granularity]) {
        throw bad(
          `${granularity} reports cover at most ${MAX_DAYS[granularity]} days; this range has ` +
            `${days}. Shorten the range or use a coarser timeGranularity.`,
        );
      }

      const requestedPivots = enumList(a.pivots, 'pivots', ALL_PIVOTS);
      const pivots = requestedPivots.length > 0 ? requestedPivots : ['CAMPAIGN' as const];
      if (pivots.length > 3) throw bad('pivots accepts at most 3 values.');
      const demographic = pivots.some((p) => p.startsWith('MEMBER_'));
      if (demographic && pivots.length > 1) {
        throw bad('A MEMBER_* (demographic) pivot must be the only pivot.');
      }

      const metricsArg =
        a.metrics === undefined || a.metrics === null ? DEFAULT_METRICS : a.metrics;
      const metrics = (Array.isArray(metricsArg) ? metricsArg : [metricsArg]).map((m) => {
        if (typeof m !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(m)) {
          throw bad(
            `metrics must be metric field names such as impressions; got ${JSON.stringify(m)}.`,
          );
        }
        return m;
      });
      if (metrics.length === 0 || metrics.length > MAX_METRICS) {
        throw bad(`metrics accepts 1 to ${MAX_METRICS} names; got ${metrics.length}.`);
      }
      const uniqueMetrics = [
        ...new Set(metrics.filter((m) => m !== 'pivotValues' && m !== 'dateRange')),
      ];

      // Exactly one facet keeps the meaning of the filter obvious.
      const facets: Array<[string, string[]]> = [];
      if (a.accountId !== undefined && a.accountId !== null) {
        facets.push([
          'accounts',
          [urn('sponsoredAccount', idList(a.accountId, 'accountId', 'sponsoredAccount', 1)[0])],
        ]);
      }
      const facetLists: Array<[string, string, string]> = [
        ['campaignGroupIds', 'campaignGroups', 'sponsoredCampaignGroup'],
        ['campaignIds', 'campaigns', 'sponsoredCampaign'],
        ['creativeIds', 'creatives', 'sponsoredCreative'],
      ];
      for (const [arg, facet, type] of facetLists) {
        const ids = idList(a[arg], arg, type, MAX_FACET_IDS);
        if (ids.length > 0) facets.push([facet, ids.map((id) => urn(type, id))]);
      }
      if (facets.length !== 1) {
        throw bad(
          'Give exactly one of accountId, campaignGroupIds, campaignIds or creativeIds ' +
            `(got ${facets.length}).`,
        );
      }
      const [facetName, facetUrns] = facets[0];

      const dateRange = `(start:${restliDate(startDate)},end:${restliDate(endDate)})`;
      const response = await apiRequest<{ elements?: Row[] }>('GET', '/adAnalytics', ctx, {
        query: [
          ['q', demographic ? 'analytics' : 'statistics'],
          demographic ? ['pivot', pivots[0]] : ['pivots', restliList(pivots)],
          ['timeGranularity', granularity],
          ['dateRange', dateRange],
          [facetName, restliList(facetUrns)],
          ['fields', ['pivotValues', 'dateRange', ...uniqueMetrics].join(',')],
        ],
        scope: 'r_ads_reporting',
      });

      // Columns rather than one object per row keep long series compact.
      const rows = response.elements ?? [];
      const withDates = granularity !== 'ALL';
      const columns: Record<string, unknown[]> = { pivotValues: [] };
      if (withDates) {
        columns.start = [];
        columns.end = [];
      }
      for (const m of uniqueMetrics) columns[m] = [];

      let size = 0;
      let kept = 0;
      for (const row of rows) {
        const range = (row.dateRange ?? {}) as { start?: unknown; end?: unknown };
        const values: Array<[string, unknown]> = [
          ['pivotValues', Array.isArray(row.pivotValues) ? row.pivotValues : []],
        ];
        if (withDates) {
          values.push(['start', isoFromRestli(range.start)], ['end', isoFromRestli(range.end)]);
        }
        for (const m of uniqueMetrics) values.push([m, row[m] ?? null]);
        size += JSON.stringify(values).length;
        if (size > MAX_RESULT_CHARS - 2_000) break;
        for (const [key, value] of values) columns[key].push(value);
        kept++;
      }

      const limitApplied = kept < rows.length;
      return {
        pivots,
        timeGranularity: granularity,
        startDate,
        endDate,
        rowCount: kept,
        columns,
        limitApplied,
        ...(limitApplied
          ? {
              note:
                `Only the first ${kept} of ${rows.length} rows fit in one result. Narrow the ` +
                'date range, use a coarser timeGranularity, fewer metrics or fewer ids.',
            }
          : {}),
      };
    },
  });
}
