import type { AgentApp } from '@agentapps/sdk';
import { fetchAdObject, readTarget } from '../lib/ad-objects.js';
import { asArgs, readBudget } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { toBudget } from '../lib/results.js';

export function registerUpdateBudgetTool(app: AgentApp): void {
  app.tool('update-budget', {
    description:
      "Change the daily or lifetime budget of a campaign (when it uses a campaign budget) or of an ad set. THIS AFFECTS SPEND: a higher budget lets Meta spend more, from the moment it is saved. Amounts are integers in the account currency's minor units (cents: 5000 = 50.00; see list-ad-accounts for the currency). Give the budget type the object already uses; the tool refuses to switch types or to move a budget between campaign and ad set. Meta allows about 4 budget changes per ad set per hour. Returns { success, id, name, level, budgetType, previousBudget, newBudget }.",
    parameters: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          enum: ['campaign', 'adset'],
          description: 'What the id is: campaign or adset.',
        },
        id: {
          type: ['string', 'number'],
          description: 'Its id (digits; pass as a string, ids have up to 18 digits).',
        },
        dailyBudget: {
          type: 'integer',
          minimum: 1,
          description: 'New daily budget in minor units (cents).',
        },
        lifetimeBudget: {
          type: 'integer',
          minimum: 1,
          description: 'New lifetime budget in minor units (cents).',
        },
      },
      required: ['level', 'id'],
    },
    annotations: {
      readOnlyHint: false,
      // Raising a budget increases real spend, which cannot be taken back.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = asArgs(args);
      const { level, id, label } = readTarget(a, ['campaign', 'adset']);
      const daily = readBudget(a, 'dailyBudget');
      const lifetime = readBudget(a, 'lifetimeBudget');
      if ((daily === undefined) === (lifetime === undefined)) {
        throw new Error('[BAD_REQUEST] Give exactly one of dailyBudget or lifetimeBudget.');
      }
      const budgetType = daily !== undefined ? 'daily' : 'lifetime';
      const newBudget = (daily ?? lifetime) as number;

      const current = await fetchAdObject(ctx, level, id, ['daily_budget', 'lifetime_budget']);
      const currentDaily = toBudget(current.daily_budget);
      const currentLifetime = toBudget(current.lifetime_budget);
      const previousBudget = budgetType === 'daily' ? currentDaily : currentLifetime;
      if (previousBudget === undefined) {
        const other = budgetType === 'daily' ? currentLifetime : currentDaily;
        if (other !== undefined) {
          throw new Error(
            `[BAD_REQUEST] This ${label} uses a ${budgetType === 'daily' ? 'lifetime' : 'daily'} budget (${other}); pass ${budgetType === 'daily' ? 'lifetimeBudget' : 'dailyBudget'} instead. Nothing was changed.`,
          );
        }
        throw new Error(
          level === 'campaign'
            ? '[BAD_REQUEST] This campaign has no campaign budget: its ad sets carry the budget. Update the ad sets (level:adset; list-ad-sets shows them). Nothing was changed.'
            : '[BAD_REQUEST] This ad set has no budget of its own: its campaign budget applies. Update the campaign (level:campaign). Nothing was changed.',
        );
      }
      if (previousBudget === newBudget) {
        return {
          success: true,
          id,
          name: current.name,
          level,
          budgetType,
          previousBudget,
          newBudget,
          changed: false,
        };
      }
      await apiRequest('POST', `/${id}`, ctx, {
        form: { [budgetType === 'daily' ? 'daily_budget' : 'lifetime_budget']: newBudget },
      });
      return {
        success: true,
        id,
        name: current.name,
        level,
        budgetType,
        previousBudget,
        newBudget,
        changed: true,
      };
    },
  });
}
