import type { AgentApp } from '@agentapps/sdk';
import {
  CUSTOMER_ID_SCHEMA,
  LOGIN_CUSTOMER_ID_SCHEMA,
  parseCustomerId,
  parseInteger,
  parseOptionalCustomerId,
} from '../lib/args.js';
import { fromMicros, search, withinBudget } from '../lib/gaql.js';

export function registerListCampaignBudgetsTool(app: AgentApp): void {
  app.tool('list-campaign-budgets', {
    description:
      'List the campaign budgets of one Google Ads account (not removed). ' +
      'Returns { currency, budgets: [{ budgetId, name, amount, period, deliveryMethod, shared, campaignCount, status }], limitApplied }. ' +
      'amount is in the account currency per period (DAILY for most budgets). A shared budget (shared: true, campaignCount > 1) is spent by several campaigns: changing it with update-campaign-budget changes all of them.',
    parameters: {
      type: 'object',
      properties: {
        customerId: CUSTOMER_ID_SCHEMA,
        loginCustomerId: LOGIN_CUSTOMER_ID_SCHEMA,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Maximum budgets to return (default 100, max 500), largest first.',
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
      const limit = parseInteger(a.limit, 'limit', { min: 1, max: 500, fallback: 100 });

      const query =
        'SELECT campaign_budget.id, campaign_budget.name, campaign_budget.amount_micros, campaign_budget.period, ' +
        'campaign_budget.delivery_method, campaign_budget.explicitly_shared, campaign_budget.reference_count, ' +
        'campaign_budget.status, customer.currency_code FROM campaign_budget ' +
        `WHERE campaign_budget.status != 'REMOVED' ORDER BY campaign_budget.amount_micros DESC LIMIT ${limit + 1}`;

      const page = await search(ctx, customerId, query, { loginCustomerId });
      const rows = page.results ?? [];
      const budgets = rows.slice(0, limit).map((row) => {
        const b = row.campaignBudget ?? {};
        return {
          budgetId: String(b.id ?? ''),
          name: b.name ?? null,
          amount: fromMicros(b.amountMicros),
          period: b.period ?? null,
          deliveryMethod: b.deliveryMethod ?? null,
          shared: b.explicitlyShared === true,
          campaignCount: Number(b.referenceCount ?? 0),
          status: b.status ?? null,
        };
      });
      const { kept, cut } = withinBudget(budgets);
      return {
        currency: rows[0]?.customer?.currencyCode ?? null,
        budgets: kept,
        limitApplied: rows.length > limit || cut,
      };
    },
  });
}
