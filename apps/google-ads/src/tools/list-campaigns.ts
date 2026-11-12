import type { AgentApp } from '@agentapps/sdk';
import {
  CUSTOMER_ID_SCHEMA,
  LOGIN_CUSTOMER_ID_SCHEMA,
  parseCustomerId,
  parseEnum,
  parseInteger,
  parseOptionalCustomerId,
} from '../lib/args.js';
import { fromMicros, search, withinBudget } from '../lib/gaql.js';

const STATUS_FILTERS = ['ACTIVE_OR_PAUSED', 'ENABLED', 'PAUSED', 'REMOVED', 'ALL'] as const;

export function registerListCampaignsTool(app: AgentApp): void {
  app.tool('list-campaigns', {
    description:
      'List the campaigns of one Google Ads account with their settings, without metrics (campaigns that had no traffic are included). ' +
      'Returns { currency, campaigns: [{ campaignId, name, status, servingStatus, primaryStatus, channelType, biddingStrategyType, startDateTime, endDateTime, budgetId, dailyBudget }], limitApplied }. ' +
      'dailyBudget is in the account currency. Use the campaignId with get-performance-report, pause-campaign or enable-campaign, and the budgetId with update-campaign-budget.',
    parameters: {
      type: 'object',
      properties: {
        customerId: CUSTOMER_ID_SCHEMA,
        loginCustomerId: LOGIN_CUSTOMER_ID_SCHEMA,
        status: {
          type: 'string',
          enum: STATUS_FILTERS,
          description:
            'Which campaigns to list (default ACTIVE_OR_PAUSED: everything not removed).',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Maximum campaigns to return (default 100, max 500), ordered by name.',
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
      const status = parseEnum(a.status, 'status', STATUS_FILTERS, 'ACTIVE_OR_PAUSED');
      const limit = parseInteger(a.limit, 'limit', { min: 1, max: 500, fallback: 100 });

      const where =
        status === 'ALL'
          ? ''
          : status === 'ACTIVE_OR_PAUSED'
            ? ` WHERE campaign.status != 'REMOVED'`
            : ` WHERE campaign.status = '${status}'`;
      const query =
        'SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.primary_status, ' +
        'campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.start_date_time, ' +
        'campaign.end_date_time, campaign_budget.id, campaign_budget.amount_micros, customer.currency_code ' +
        `FROM campaign${where} ORDER BY campaign.name LIMIT ${limit + 1}`;

      const page = await search(ctx, customerId, query, { loginCustomerId });
      const rows = page.results ?? [];
      const campaigns = rows.slice(0, limit).map((row) => ({
        campaignId: String(row.campaign?.id ?? ''),
        name: row.campaign?.name ?? null,
        status: row.campaign?.status ?? null,
        servingStatus: row.campaign?.servingStatus ?? null,
        primaryStatus: row.campaign?.primaryStatus ?? null,
        channelType: row.campaign?.advertisingChannelType ?? null,
        biddingStrategyType: row.campaign?.biddingStrategyType ?? null,
        startDateTime: row.campaign?.startDateTime ?? null,
        endDateTime: row.campaign?.endDateTime ?? null,
        budgetId: row.campaignBudget?.id ? String(row.campaignBudget.id) : null,
        dailyBudget: row.campaignBudget ? fromMicros(row.campaignBudget.amountMicros) : null,
      }));
      const { kept, cut } = withinBudget(campaigns);
      return {
        currency: rows[0]?.customer?.currencyCode ?? null,
        campaigns: kept,
        limitApplied: rows.length > limit || cut,
      };
    },
  });
}
