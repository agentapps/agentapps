import type { AgentApp } from '@agentapps/sdk';
import { type Args, amount, bad, money, numericId } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { budgetCurrency, patchEntity } from '../lib/writes.js';

export function registerUpdateCampaignGroupBudgetTool(app: AgentApp): void {
  app.tool('update-campaign-group-budget', {
    description:
      'Change the total (lifetime) budget of one LinkedIn campaign group, shared by all its ' +
      'campaigns. AFFECTS SPEND: a higher budget lets its campaigns be billed more. The group ' +
      'needs an end date (runSchedule.end) for a total budget; LinkedIn answers 400 otherwise. ' +
      'Amount in the account currency, at most 2 decimals. Returns { success, id, accountId, ' +
      'previous: { totalBudget }, updated: { totalBudget } }.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: ['string', 'number'],
          description: 'Ad account id from list-ad-accounts.',
        },
        campaignGroupId: {
          type: ['string', 'number'],
          description: 'Campaign group id from list-campaign-groups.',
        },
        totalBudget: {
          type: ['string', 'number'],
          description: 'New total budget, e.g. 5000 or "4999.50" (account currency).',
        },
      },
      required: ['accountId', 'campaignGroupId', 'totalBudget'],
    },
    annotations: {
      readOnlyHint: false,
      // Raising a budget lets LinkedIn spend more real money, which cannot be undone.
      destructiveHint: true,
      // Sets an absolute value: repeating the call changes nothing more.
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const accountId = numericId(a.accountId, 'accountId', 'sponsoredAccount');
      const id = numericId(a.campaignGroupId, 'campaignGroupId', 'sponsoredCampaignGroup');
      const total = amount(a.totalBudget, 'totalBudget');
      if (total === undefined) throw bad('totalBudget is required.');

      const path = `/adAccounts/${accountId}/adCampaignGroups/${id}`;
      const group = await apiRequest<Record<string, unknown>>('GET', path, ctx, { scope: 'r_ads' });
      const previous = { totalBudget: money(group.totalBudget) };
      const currencyCode = await budgetCurrency(ctx, accountId, previous.totalBudget);

      const updated = { totalBudget: { amount: total, currencyCode } };
      await patchEntity(ctx, path, updated);

      return {
        success: true,
        id,
        accountId,
        name: group.name ?? null,
        status: group.status ?? null,
        previous,
        updated,
      };
    },
  });
}
