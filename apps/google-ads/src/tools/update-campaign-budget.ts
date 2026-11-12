import type { AgentApp } from '@agentapps/sdk';
import {
  CUSTOMER_ID_SCHEMA,
  LOGIN_CUSTOMER_ID_SCHEMA,
  parseBoolean,
  parseCustomerId,
  parseId,
  parseOptionalCustomerId,
  VALIDATE_ONLY_SCHEMA,
} from '../lib/args.js';
import { fromMicros, search } from '../lib/gaql.js';
import { mutate } from '../lib/mutate.js';

/** Budgets are set in whole cents: Google rejects amounts below the currency's smallest unit. */
const MICROS_STEP = 10_000;
/** A sanity cap (1 billion per period) that catches unit mistakes such as passing micros. */
const MAX_AMOUNT = 1_000_000_000;

export function registerUpdateCampaignBudgetTool(app: AgentApp): void {
  app.tool('update-campaign-budget', {
    description:
      'Change the amount of one campaign budget. AFFECTS SPEND: a higher budget lets the campaigns spend more from now on. ' +
      'amount is in the account currency per budget period (usually per day), NOT micros: 50 means 50.00. It is rounded to cents; currencies without cents (JPY) need whole amounts. ' +
      'A shared budget changes every campaign that uses it (campaignCount in the result). ' +
      'Returns { success, budgetId, name, previousAmount, newAmount, currency, period, campaignCount, validateOnly }. ' +
      'Get budgetId from list-campaigns or list-campaign-budgets. Pass validateOnly: true for a dry run.',
    parameters: {
      type: 'object',
      properties: {
        customerId: CUSTOMER_ID_SCHEMA,
        loginCustomerId: LOGIN_CUSTOMER_ID_SCHEMA,
        budgetId: {
          type: ['string', 'number'],
          description: 'Numeric campaign budget ID.',
        },
        amount: {
          type: 'number',
          exclusiveMinimum: 0,
          description: 'New budget amount in the account currency per period, e.g. 50 or 49.99.',
        },
        validateOnly: VALIDATE_ONLY_SCHEMA,
      },
      required: ['customerId', 'budgetId', 'amount'],
    },
    annotations: {
      readOnlyHint: false,
      // Raising a budget lets money be spent that cannot be recovered, so this counts as destructive.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const customerId = parseCustomerId(a.customerId);
      const loginCustomerId = parseOptionalCustomerId(a.loginCustomerId, 'loginCustomerId');
      const budgetId = parseId(a.budgetId, 'budgetId');
      const amount = typeof a.amount === 'string' ? Number(a.amount) : a.amount;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw new Error(
          `[BAD_REQUEST] amount must be a positive number in the account currency; got ${JSON.stringify(a.amount)}.`,
        );
      }
      if (amount > MAX_AMOUNT) {
        throw new Error(
          `[BAD_REQUEST] amount ${amount} looks like micros. Pass the amount in currency units (50 = 50.00).`,
        );
      }
      const validateOnly = parseBoolean(a.validateOnly, 'validateOnly', false);
      const amountMicros = Math.round((amount * 1_000_000) / MICROS_STEP) * MICROS_STEP;
      if (amountMicros <= 0) {
        throw new Error('[BAD_REQUEST] amount rounds to 0; the smallest budget step is 0.01.');
      }

      // Read the budget first: it proves the ID and gives the previous amount and its reach.
      const current = await search(
        ctx,
        customerId,
        'SELECT campaign_budget.id, campaign_budget.name, campaign_budget.amount_micros, campaign_budget.period, ' +
          'campaign_budget.reference_count, campaign_budget.status, customer.currency_code ' +
          `FROM campaign_budget WHERE campaign_budget.id = ${budgetId}`,
        { loginCustomerId },
      );
      const row = current.results?.[0];
      if (!row?.campaignBudget || row.campaignBudget.status === 'REMOVED') {
        throw new Error(
          `[NOT_FOUND] Campaign budget ${budgetId} does not exist in customer ${customerId} (or was removed). Check it with list-campaign-budgets.`,
        );
      }
      const resourceName = `customers/${customerId}/campaignBudgets/${budgetId}`;
      await mutate(
        ctx,
        customerId,
        'campaignBudgets',
        {
          operations: [
            {
              updateMask: 'amountMicros',
              update: { resourceName, amountMicros: String(amountMicros) },
            },
          ],
          validateOnly,
        },
        loginCustomerId,
      );
      return {
        success: true,
        budgetId,
        name: row.campaignBudget.name ?? null,
        previousAmount: fromMicros(row.campaignBudget.amountMicros),
        newAmount: amountMicros / 1_000_000,
        currency: row.customer?.currencyCode ?? null,
        period: row.campaignBudget.period ?? null,
        campaignCount: Number(row.campaignBudget.referenceCount ?? 0),
        validateOnly,
      };
    },
  });
}
