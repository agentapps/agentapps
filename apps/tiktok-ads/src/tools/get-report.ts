import type { AgentApp } from '@agentapps/sdk';
import { type Args, badRequest, parseEnum, parseId, parseInteger } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import type { PageInfo } from '../lib/entities.js';
import { advertiserIdSchema } from '../lib/schemas.js';

const REPORT_TYPES = ['BASIC', 'AUDIENCE'] as const;
const DATA_LEVELS = [
  'AUCTION_CAMPAIGN',
  'AUCTION_ADGROUP',
  'AUCTION_AD',
  'AUCTION_ADVERTISER',
] as const;
const FILTER_TYPES = [
  'IN',
  'MATCH',
  'GREATER_EQUAL',
  'GREATER_THAN',
  'LOWER_EQUAL',
  'LOWER_THAN',
  'BETWEEN',
] as const;

const LEVEL_ID: Record<(typeof DATA_LEVELS)[number], string> = {
  AUCTION_CAMPAIGN: 'campaign_id',
  AUCTION_ADGROUP: 'adgroup_id',
  AUCTION_AD: 'ad_id',
  AUCTION_ADVERTISER: 'advertiser_id',
};

const DEFAULT_METRICS = [
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'conversion',
  'cost_per_conversion',
];

/** App-level bound on the date range; TikTok applies finer limits of its own. */
export const MAX_RANGE_DAYS = 365;
const MAX_PAGE_SIZE = 500;
const MAX_DIMENSIONS = 4;
const MAX_METRICS = 40;
const MAX_FILTERS = 10;
/** The final size check: the SDK replaces results over 50,000 characters. */
const MAX_RESULT_CHARS = 45_000;

const NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
/** Attribute "metrics" that are text, not numbers: names, ids, statuses, currency. */
const TEXT_METRIC = /(_name|_id|_status|_type|currency|_text|_url)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseNames(value: unknown, name: string, max: number, fallback: string[]): string[] {
  if (value === undefined || value === null) return fallback;
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0) return fallback;
  if (list.length > max) throw badRequest(`${name} has ${list.length} entries; at most ${max}.`);
  for (const v of list) {
    if (typeof v !== 'string' || !NAME_PATTERN.test(v)) {
      throw badRequest(
        `${name} entries are TikTok field names in snake_case (e.g. "spend"); got ${JSON.stringify(v)}.`,
      );
    }
  }
  return [...new Set(list as string[])];
}

function parseDate(value: unknown, name: string): string {
  const s = typeof value === 'string' ? value.trim() : '';
  const time = Date.parse(`${s}T00:00:00Z`);
  if (
    !DATE_PATTERN.test(s) ||
    Number.isNaN(time) ||
    new Date(time).toISOString().slice(0, 10) !== s
  ) {
    throw badRequest(
      `${name} must be a date as YYYY-MM-DD; got ${JSON.stringify(value) ?? 'nothing'}.`,
    );
  }
  return s;
}

function parseFilters(value: unknown): Array<Record<string, string>> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value))
    throw badRequest('filters must be a list of { fieldName, filterType, filterValue }.');
  if (value.length === 0) return undefined;
  if (value.length > MAX_FILTERS)
    throw badRequest(`filters has ${value.length} entries; at most ${MAX_FILTERS}.`);
  return value.map((f, i) => {
    const o = (f ?? {}) as Args;
    const fieldName = o.fieldName;
    if (typeof fieldName !== 'string' || !NAME_PATTERN.test(fieldName)) {
      throw badRequest(`filters[${i}].fieldName must be a snake_case TikTok field name.`);
    }
    const filterType = parseEnum(o.filterType, `filters[${i}].filterType`, FILTER_TYPES);
    const raw = o.filterValue;
    let filterValue: string;
    if (Array.isArray(raw)) {
      // IN and BETWEEN take a JSON array of strings; ids must stay exact strings.
      filterValue = JSON.stringify(
        raw.map((v, j) => {
          if (typeof v === 'number' && !Number.isSafeInteger(v) && Number.isInteger(v)) {
            throw badRequest(
              `filters[${i}].filterValue[${j}] ${v} is not exact (it was rounded): pass ids as strings.`,
            );
          }
          return String(v);
        }),
      );
    } else if (typeof raw === 'string' || typeof raw === 'number') {
      filterValue = String(raw);
    } else {
      throw badRequest(
        `filters[${i}].filterValue must be a string, a number or a list of strings.`,
      );
    }
    return { field_name: fieldName, filter_type: filterType, filter_value: filterValue };
  });
}

/** Metric values arrive as strings ("12.30", "-"); numbers become numbers, the rest stays. */
function metricValue(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? null;
  if (v === '' || v === '-') return null;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

interface ReportData {
  list?: Array<{ dimensions?: Record<string, unknown>; metrics?: Record<string, unknown> }>;
  page_info?: PageInfo;
  total_metrics?: Record<string, unknown>;
}

export function registerGetReportTool(app: AgentApp): void {
  app.tool('get-report', {
    description:
      'Run a synchronous TikTok Ads report (report/integrated/get) for one ad account: spend, ' +
      'impressions, clicks, conversions and other metrics, broken down by dimensions. Returns ' +
      '{ columns, rows (arrays in column order), page, pageSize, totalNumber, totalPage, hasMore, ' +
      'totals? }; metric values are numbers (null when TikTok reports "-"), ids stay strings. ' +
      'Dates are YYYY-MM-DD in the account time zone (see get-advertiser-info), at most ' +
      `${MAX_RANGE_DAYS} days apart. BASIC report dimensions: campaign_id, adgroup_id, ad_id, ` +
      'advertiser_id, stat_time_day, stat_time_hour (TikTok limits hourly data to short ranges). ' +
      'AUDIENCE report adds gender, age, country_code, platform, language, ac and others, ' +
      'combined with one id dimension. Common metrics: spend, impressions, clicks, ctr, cpc, cpm, ' +
      'reach, frequency, conversion, cost_per_conversion, conversion_rate, result, cost_per_result, ' +
      'video_play_actions, video_watched_2s, video_watched_6s, likes, comments, shares, follows; ' +
      'at the campaign/ad group/ad level also campaign_name, adgroup_name, ad_name. TikTok ' +
      'rejects unknown or unsupported names with a [BAD_REQUEST] that names them.',
    parameters: {
      type: 'object',
      properties: {
        advertiserId: advertiserIdSchema,
        reportType: {
          type: 'string',
          enum: [...REPORT_TYPES],
          description: 'BASIC (default) for performance; AUDIENCE for demographic breakdowns.',
        },
        dataLevel: {
          type: 'string',
          enum: [...DATA_LEVELS],
          description: 'Aggregation level. Default AUCTION_CAMPAIGN.',
        },
        dimensions: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_DIMENSIONS,
          description:
            'Grouping, at most 4, e.g. ["campaign_id", "stat_time_day"]. Default: the level id ' +
            '(campaign_id for AUCTION_CAMPAIGN).',
        },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_METRICS,
          description: `Metrics, at most ${MAX_METRICS}. Default: ${DEFAULT_METRICS.join(', ')}.`,
        },
        startDate: {
          type: 'string',
          description: 'First day, YYYY-MM-DD. Required unless lifetime is true.',
        },
        endDate: {
          type: 'string',
          description: 'Last day (inclusive), YYYY-MM-DD. Required unless lifetime is true.',
        },
        lifetime: {
          type: 'boolean',
          description:
            'Lifetime totals instead of a date range (no stat_time_* dimensions). Default false.',
        },
        filters: {
          type: 'array',
          maxItems: MAX_FILTERS,
          description:
            'Row filters, e.g. [{ "fieldName": "campaign_ids", "filterType": "IN", "filterValue": ' +
            '["1800000000000000001"] }]. Common fields: campaign_ids, adgroup_ids, ad_ids, ' +
            'campaign_name (MATCH), objective_type, country_code, gender, age.',
          items: {
            type: 'object',
            properties: {
              fieldName: { type: 'string', description: 'Field to filter on (snake_case).' },
              filterType: { type: 'string', enum: [...FILTER_TYPES], description: 'Comparison.' },
              filterValue: {
                type: ['string', 'number', 'array'],
                items: { type: 'string' },
                description: 'Value; a list of strings for IN and BETWEEN.',
              },
            },
            required: ['fieldName', 'filterType', 'filterValue'],
          },
        },
        orderField: { type: 'string', description: 'Metric to sort by, e.g. "spend".' },
        orderType: {
          type: 'string',
          enum: ['ASC', 'DESC'],
          description: 'Sort direction. Default DESC.',
        },
        includeTotals: {
          type: 'boolean',
          description: 'Also return totals over all rows of the report (all pages). Default false.',
        },
        page: { type: 'integer', minimum: 1, description: 'Page number, from 1. Default 1.' },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_PAGE_SIZE,
          description: `Rows per page, 1-${MAX_PAGE_SIZE}. Default 100.`,
        },
      },
      required: ['advertiserId'],
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
      const advertiserId = parseId(a.advertiserId, 'advertiserId');
      const reportType = parseEnum(a.reportType, 'reportType', REPORT_TYPES, 'BASIC');
      const dataLevel = parseEnum(a.dataLevel, 'dataLevel', DATA_LEVELS, 'AUCTION_CAMPAIGN');
      const dimensions = parseNames(a.dimensions, 'dimensions', MAX_DIMENSIONS, [
        LEVEL_ID[dataLevel],
      ]);
      const metrics = parseNames(a.metrics, 'metrics', MAX_METRICS, DEFAULT_METRICS);
      if (a.lifetime !== undefined && typeof a.lifetime !== 'boolean') {
        throw badRequest('lifetime must be true or false.');
      }
      const lifetime = a.lifetime === true;
      let startDate: string | undefined;
      let endDate: string | undefined;
      if (lifetime) {
        if (dimensions.some((d) => d.startsWith('stat_time_'))) {
          throw badRequest(
            'A lifetime report cannot use stat_time_* dimensions; give a date range instead.',
          );
        }
      } else {
        startDate = parseDate(a.startDate, 'startDate');
        endDate = parseDate(a.endDate, 'endDate');
        const days = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000;
        if (days < 0) throw badRequest('endDate is before startDate.');
        if (days + 1 > MAX_RANGE_DAYS) {
          throw badRequest(
            `The range covers ${days + 1} days; at most ${MAX_RANGE_DAYS}. Split it into several reports.`,
          );
        }
      }
      const filtering = parseFilters(a.filters);
      let orderField: string | undefined;
      if (a.orderField !== undefined && a.orderField !== null && a.orderField !== '') {
        if (typeof a.orderField !== 'string' || !NAME_PATTERN.test(a.orderField)) {
          throw badRequest('orderField must be a snake_case metric name.');
        }
        orderField = a.orderField;
      }
      const orderType = orderField
        ? parseEnum(a.orderType, 'orderType', ['ASC', 'DESC'] as const, 'DESC')
        : undefined;
      const page = parseInteger(a.page, 'page', 1, 100_000, 1);
      const pageSize = parseInteger(a.pageSize, 'pageSize', 1, MAX_PAGE_SIZE, 100);

      const data = await apiRequest<ReportData>('GET', '/report/integrated/get/', ctx, {
        params: {
          advertiser_id: advertiserId,
          service_type: 'AUCTION',
          report_type: reportType,
          data_level: dataLevel,
          dimensions,
          metrics,
          start_date: startDate,
          end_date: endDate,
          query_lifetime: lifetime ? true : undefined,
          filtering,
          order_field: orderField,
          order_type: orderType,
          enable_total_metrics: a.includeTotals === true ? true : undefined,
          page,
          page_size: pageSize,
        },
      });

      // Columns: the requested dimensions, then the metrics, then anything else TikTok sent
      // (some metrics such as campaign_name are only returned when asked for).
      const columns = [...dimensions, ...metrics];
      const extra = new Set<string>();
      for (const row of data.list ?? []) {
        for (const k of Object.keys({ ...row.dimensions, ...row.metrics })) {
          if (!columns.includes(k)) extra.add(k);
        }
      }
      columns.push(...extra);
      const rows = (data.list ?? []).map((row) =>
        columns.map((c) => {
          const metrics = row.metrics ?? {};
          if (c in metrics)
            return TEXT_METRIC.test(c) ? (metrics[c] ?? null) : metricValue(metrics[c]);
          return row.dimensions?.[c] ?? null;
        }),
      );
      const info = data.page_info ?? {};
      const totalPage = info.total_page ?? 0;
      const result: Record<string, unknown> = {
        reportType,
        dataLevel,
        ...(lifetime ? { lifetime: true } : { startDate, endDate }),
        columns,
        rows,
        page: info.page ?? page,
        pageSize: info.page_size ?? pageSize,
        totalNumber: info.total_number ?? rows.length,
        totalPage,
        hasMore: (info.page ?? page) < totalPage,
      };
      if (data.total_metrics) {
        result.totals = Object.fromEntries(
          Object.entries(data.total_metrics).map(([k, v]) => [k, metricValue(v)]),
        );
      }
      const size = JSON.stringify(result).length;
      if (size > MAX_RESULT_CHARS) {
        throw new Error(
          `[RESULT_TOO_LARGE] This page of the report is ${size} characters, over the ${MAX_RESULT_CHARS} ` +
            'limit. Lower pageSize, request fewer metrics or dimensions, or a shorter date range.',
        );
      }
      return result;
    },
  });
}
