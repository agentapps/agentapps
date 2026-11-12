import type { AgentApp } from '@agentapps/sdk';
import {
  asArgs,
  readBoolean,
  readDate,
  readEnum,
  readId,
  readInt,
  readList,
  readString,
} from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { type GraphPage, listResult } from '../lib/results.js';
import { READ_ONLY } from './annotations.js';

const LEVELS = ['account', 'campaign', 'adset', 'ad'] as const;
type Level = (typeof LEVELS)[number];

export const DATE_PRESETS = [
  'today',
  'yesterday',
  'this_month',
  'last_month',
  'this_quarter',
  'maximum',
  'data_maximum',
  'last_3d',
  'last_7d',
  'last_14d',
  'last_28d',
  'last_30d',
  'last_90d',
  'last_week_mon_sun',
  'last_week_sun_sat',
  'last_quarter',
  'last_year',
  'this_week_mon_today',
  'this_week_sun_today',
  'this_year',
] as const;

const BASE_METRICS = [
  'spend',
  'impressions',
  'reach',
  'frequency',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'account_currency',
];

/** The id and name fields of each level, so every row says what it is about. */
const LEVEL_FIELDS: Record<Level, string[]> = {
  account: ['account_id', 'account_name'],
  campaign: ['campaign_id', 'campaign_name'],
  adset: ['adset_id', 'adset_name'],
  ad: ['ad_id', 'ad_name'],
};

const FIELD_PATTERN = /^[a-z0-9_]+$/;

type Row = Record<string, unknown>;

/**
 * Graph returns every metric as a string ("12.34"). Numeric metrics become numbers, so an
 * agent can add them up; ids, names, dates and breakdown values (a zip code like "08001")
 * stay strings. In action lists ({ action_type, value }) only `value` is converted.
 */
function cleanRow(row: Row, keepAsString: Set<string>): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (keepAsString.has(key) || key.endsWith('_id') || key.endsWith('_name')) {
      out[key] = value;
    } else if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
      out[key] = Number(value);
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) =>
        item && typeof item === 'object' && typeof (item as Row).value === 'string'
          ? { ...(item as Row), value: Number((item as Row).value) }
          : item,
      );
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function registerGetInsightsTool(app: AgentApp): void {
  app.tool('get-insights', {
    description:
      'Performance report (Ads Insights) for an ad account, campaign, ad set or ad. Returns rows with date_start, date_stop, the id and name of the chosen level and the metrics: by default spend (in the account currency\'s major units, e.g. 12.34, see account_currency), impressions, reach, frequency, clicks, ctr (%), cpc and cpm. Add "actions", "action_values", "cost_per_action_type" or "purchase_roas" to fields for conversions. Use level to split an account or campaign into its campaigns, ad sets or ads, breakdowns to split by age, gender, country, publisher_platform, platform_position or device_platform, and timeIncrement:1 for a daily series. Give datePreset (default last_30d) or since and until. Attribution follows each ad set\'s settings, as Ads Manager does. Large reports time out: shorten the range, use fewer breakdowns or a lower limit.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: ['string', 'number'],
          description:
            'What to report on: an ad account, written act_<digits> (the act_ prefix is required here), or a campaign, ad set or ad id (bare digits; pass as a string, ids have up to 18 digits).',
        },
        level: {
          type: 'string',
          enum: [...LEVELS],
          description:
            'Row level: one row per account, campaign, adset or ad. Default: the level of id itself.',
        },
        datePreset: {
          type: 'string',
          enum: [...DATE_PRESETS],
          description:
            "Relative range in the ad account's time zone (default last_30d). Ignored when since and until are given.",
        },
        since: { type: 'string', description: 'Start date, YYYY-MM-DD (with until).' },
        until: { type: 'string', description: 'End date, YYYY-MM-DD, inclusive (with since).' },
        timeIncrement: {
          type: ['integer', 'string'],
          description:
            'Split the range: 1 for daily rows, 7 for weekly, any 1-90, or "monthly". Default: one row for the whole range.',
        },
        breakdowns: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 3,
          description:
            'Split rows by e.g. age, gender, country, region, publisher_platform, platform_position, device_platform, impression_device. Not every combination is valid (Meta says which).',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 40,
          description:
            'Metrics to return instead of the default set, e.g. ["spend","impressions","actions"]. The level id and name are always added.',
        },
        sort: {
          type: 'string',
          description: 'One field and a direction, e.g. "spend_descending" or "ctr_ascending".',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Rows per page (default 100, max 500).',
        },
        after: { type: 'string', description: 'The nextCursor from a previous call.' },
        useUnifiedAttribution: {
          type: 'boolean',
          description:
            "Use each ad set's attribution setting, like Ads Manager (default true). false uses Meta's API default windows.",
        },
      },
      required: ['id'],
    },
    annotations: READ_ONLY,
    handler: async (args, ctx) => {
      const a = asArgs(args);
      // act_<digits> is an ad account; a bare id may be a campaign, ad set or ad (Graph
      // knows which, so the tool does not need to).
      const rawId = a.id;
      const isAccount = typeof rawId === 'string' && rawId.trim().startsWith('act_');
      const objectPath = isAccount
        ? `act_${readId({ id: rawId.trim().slice(4) }, 'id', { required: true })}`
        : readId(a, 'id', { required: true });
      const level = readEnum(a, 'level', LEVELS);

      const since = readDate(a, 'since');
      const until = readDate(a, 'until');
      if ((since === undefined) !== (until === undefined)) {
        throw new Error('[BAD_REQUEST] Give both since and until (YYYY-MM-DD), or neither.');
      }
      if (since && until && since > until) {
        throw new Error(`[BAD_REQUEST] since (${since}) is after until (${until}).`);
      }
      const datePreset = since ? undefined : readEnum(a, 'datePreset', DATE_PRESETS, 'last_30d');

      let timeIncrement: string | number | undefined;
      const rawIncrement = a.timeIncrement;
      if (rawIncrement === 'monthly' || rawIncrement === 'all_days') {
        timeIncrement = rawIncrement;
      } else if (rawIncrement !== undefined && rawIncrement !== null && rawIncrement !== '') {
        timeIncrement = readInt(a, 'timeIncrement', { min: 1, max: 90 });
      }

      const breakdowns = readList(a, 'breakdowns', {
        pattern: FIELD_PATTERN,
        max: 3,
        describe: 'a breakdown name (lowercase letters, digits and _)',
      });
      const metrics =
        readList(a, 'fields', {
          pattern: FIELD_PATTERN,
          max: 40,
          describe: 'a field name (lowercase letters, digits and _)',
        }) ?? BASE_METRICS;
      const sort = readString(a, 'sort', { max: 100 });
      if (sort && !/^[a-z0-9_:.]+_(ascending|descending)$/.test(sort)) {
        throw new Error(
          `[BAD_REQUEST] sort must be a field and a direction, e.g. "spend_descending"; got ${JSON.stringify(sort)}.`,
        );
      }

      // Without an explicit level, a bare id reports at its own level, which the tool does
      // not know, so only the metrics go out (asking a campaign for ad_id would fail).
      const levelFields = level ? LEVEL_FIELDS[level] : isAccount ? LEVEL_FIELDS.account : [];
      const fields = [...new Set([...levelFields, ...metrics])];

      const page = await apiRequest<GraphPage<Row>>('GET', `/${objectPath}/insights`, ctx, {
        params: {
          fields,
          level,
          date_preset: datePreset,
          time_range: since ? JSON.stringify({ since, until }) : undefined,
          time_increment: timeIncrement,
          breakdowns,
          sort: sort ? JSON.stringify([sort]) : undefined,
          limit: readInt(a, 'limit', { min: 1, max: 500, fallback: 100 }),
          after: readString(a, 'after', { max: 500 }),
          use_unified_attribution_setting: readBoolean(a, 'useUnifiedAttribution', true),
        },
      });
      const keep = new Set(['date_start', 'date_stop', 'account_currency', ...(breakdowns ?? [])]);
      const rows = (page.data ?? []).map((row) => cleanRow(row, keep));
      return listResult(page, rows);
    },
  });
}
