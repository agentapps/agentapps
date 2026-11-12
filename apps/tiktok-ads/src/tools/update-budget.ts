import type { AgentApp } from '@agentapps/sdk';
import { type Args, badRequest, parseEnum, parseId } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { getPage } from '../lib/entities.js';
import { advertiserIdSchema } from '../lib/schemas.js';

const LEVELS = ['campaign', 'adgroup'] as const;
/** A sanity bound against a misplaced decimal point, not a TikTok limit. */
const MAX_BUDGET = 10_000_000;

export function registerUpdateBudgetTool(app: AgentApp): void {
  app.tool('update-budget', {
    description:
      'Set the budget of one TikTok campaign or ad group, in the account currency (see ' +
      'get-advertiser-info). AFFECTS SPEND: a higher budget lets TikTok spend more of the ' +
      "advertiser's money. The budget mode (daily or total) stays as it is; items with " +
      'BUDGET_MODE_INFINITE have no budget to set, and ad groups of a campaign with campaign ' +
      'budget optimization take their budget from the campaign. Reads the current budget ' +
      'first and returns { success, level, id, budgetMode, previousBudget, budget } so the ' +
      'change can be reverted. TikTok enforces minimums and how often a budget can change.',
    parameters: {
      type: 'object',
      properties: {
        advertiserId: advertiserIdSchema,
        level: {
          type: 'string',
          enum: [...LEVELS],
          description: 'campaign or adgroup.',
        },
        id: {
          type: ['string', 'number'],
          description: 'The campaign or ad group id, as a string.',
        },
        budget: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: MAX_BUDGET,
          description: 'New budget in the account currency, e.g. 50 or 49.99.',
        },
      },
      required: ['advertiserId', 'level', 'id', 'budget'],
    },
    annotations: {
      readOnlyHint: false,
      // Overwrites the budget and can raise spend; money spent cannot be taken back.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const advertiserId = parseId(a.advertiserId, 'advertiserId');
      const level = parseEnum(a.level, 'level', LEVELS);
      const id = parseId(a.id, 'id');
      const budget = typeof a.budget === 'string' ? Number(a.budget) : a.budget;
      if (
        typeof budget !== 'number' ||
        !Number.isFinite(budget) ||
        budget <= 0 ||
        budget > MAX_BUDGET
      ) {
        throw badRequest(
          `budget must be a positive number up to ${MAX_BUDGET}; got ${JSON.stringify(a.budget)}.`,
        );
      }
      const idKey = level === 'campaign' ? 'campaign_id' : 'adgroup_id';

      const current = await getPage(ctx, level, advertiserId, { [`${idKey}s`]: [id] }, 1, 1);
      const item = current.list?.find((r) => String(r[idKey]) === id);
      if (!item) {
        throw new Error(
          `[NOT_FOUND] No ${level} ${id} in advertiser ${advertiserId}. Check the id with ` +
            `${level === 'campaign' ? 'list-campaigns' : 'list-ad-groups'}.`,
        );
      }
      const budgetMode = item.budget_mode == null ? null : String(item.budget_mode);
      if (budgetMode === 'BUDGET_MODE_INFINITE') {
        throw badRequest(
          `${level} ${id} has no budget (BUDGET_MODE_INFINITE), so there is none to set.` +
            (level === 'adgroup'
              ? ' Its campaign may use campaign budget optimization: set the campaign budget instead.'
              : ''),
        );
      }
      const previousBudget =
        typeof item.budget === 'number'
          ? item.budget
          : item.budget == null
            ? null
            : Number(item.budget);

      await apiRequest('POST', `/${level}/update/`, ctx, {
        body: { advertiser_id: advertiserId, [idKey]: id, budget },
      });
      return { success: true, level, id, budgetMode, previousBudget, budget };
    },
  });
}
