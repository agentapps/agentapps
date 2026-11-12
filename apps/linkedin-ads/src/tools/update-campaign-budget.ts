import type { AgentApp } from '@agentapps/sdk';
import { type Args, amount, bad, money, numericId } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { budgetCurrency, patchEntity } from '../lib/writes.js';

export function registerUpdateCampaignBudgetTool(app: AgentApp): void {
  app.tool('update-campaign-budget', {
    description:
      'Change the daily and/or lifetime (total) budget of one LinkedIn campaign. AFFECTS ' +
      'SPEND: a higher budget lets LinkedIn bill more (up to 150% of the daily budget on a ' +
      'given day); the change applies immediately to an active campaign. Amounts are in the ' +
      'account currency, with at most 2 decimals. LinkedIn enforces minimums (often 10 per ' +
      'day). Returns { success, id, accountId, previous: { dailyBudget, totalBudget }, ' +
      'updated: { ... } }.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: ['string', 'number'],
          description: 'Ad account id from list-ad-accounts.',
        },
        campaignId: {
          type: ['string', 'number'],
          description: 'Campaign id from list-campaigns.',
        },
        dailyBudget: {
          type: ['string', 'number'],
          description: 'New daily budget, e.g. 50 or "49.99" (account currency).',
        },
        totalBudget: {
          type: ['string', 'number'],
          description: 'New lifetime budget (account currency), for campaigns that use one.',
        },
      },
      required: ['accountId', 'campaignId'],
    },
    annotations: {
      readOnlyHint: false,
      // Raising a budget lets LinkedIn spend more real money, which cannot be undone.
      destructiveHint: true,
      // Sets absolute values: repeating the call changes nothing more.
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const accountId = numericId(a.accountId, 'accountId', 'sponsoredAccount');
      const id = numericId(a.campaignId, 'campaignId', 'sponsoredCampaign');
      const daily = amount(a.dailyBudget, 'dailyBudget');
      const total = amount(a.totalBudget, 'totalBudget');
      if (daily === undefined && total === undefined) {
        throw bad('Give dailyBudget, totalBudget or both.');
      }

      const path = `/adAccounts/${accountId}/adCampaigns/${id}`;
      const campaign = await apiRequest<Record<string, unknown>>('GET', path, ctx, {
        scope: 'r_ads',
      });
      const previous = {
        dailyBudget: money(campaign.dailyBudget),
        totalBudget: money(campaign.totalBudget),
      };
      const currencyCode = await budgetCurrency(
        ctx,
        accountId,
        previous.dailyBudget,
        previous.totalBudget,
      );

      const set: Record<string, unknown> = {};
      if (daily !== undefined) set.dailyBudget = { amount: daily, currencyCode };
      if (total !== undefined) set.totalBudget = { amount: total, currencyCode };
      await patchEntity(ctx, path, set);

      return {
        success: true,
        id,
        accountId,
        name: campaign.name ?? null,
        status: campaign.status ?? null,
        previous,
        updated: set,
      };
    },
  });
}
