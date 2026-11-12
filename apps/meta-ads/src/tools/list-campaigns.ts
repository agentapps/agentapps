import type { AgentApp } from '@agentapps/sdk';
import { asArgs, readAccountId, readInt, readString } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { compact, type GraphPage, listResult, toBudget, toNumber } from '../lib/results.js';
import { readStatuses, STATUSES_PARAMETER } from '../lib/status.js';
import { READ_ONLY } from './annotations.js';

interface RawCampaign {
  id: string;
  name?: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  bid_strategy?: string;
  special_ad_categories?: string[];
  start_time?: string;
  stop_time?: string;
  updated_time?: string;
}

export function registerListCampaignsTool(app: AgentApp): void {
  app.tool('list-campaigns', {
    description:
      "List the campaigns of one ad account. Returns items with id, name, objective, status (what was set), effectiveStatus (what is really delivering), dailyBudget / lifetimeBudget / budgetRemaining in the account currency's minor units (cents; absent when the ad sets carry the budget), bidStrategy, specialAdCategories, startTime, stopTime and updatedTime. Max 100 per page; page with `after`. Use get-insights for spend and results.",
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: ['string', 'number'],
          description: 'Ad account id, act_<digits> or just the digits (from list-ad-accounts).',
        },
        statuses: STATUSES_PARAMETER,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Campaigns per page (default 50, max 100).',
        },
        after: { type: 'string', description: 'The nextCursor from a previous call.' },
      },
      required: ['accountId'],
    },
    annotations: READ_ONLY,
    handler: async (args, ctx) => {
      const a = asArgs(args);
      const accountId = readAccountId(a) as string;
      const page = await apiRequest<GraphPage<RawCampaign>>('GET', `/${accountId}/campaigns`, ctx, {
        params: {
          fields: [
            'id',
            'name',
            'objective',
            'status',
            'effective_status',
            'daily_budget',
            'lifetime_budget',
            'budget_remaining',
            'bid_strategy',
            'special_ad_categories',
            'start_time',
            'stop_time',
            'updated_time',
          ],
          effective_status: readStatuses(a),
          limit: readInt(a, 'limit', { min: 1, max: 100, fallback: 50 }),
          after: readString(a, 'after', { max: 500 }),
        },
      });
      const items = (page.data ?? []).map((c) =>
        compact({
          id: c.id,
          name: c.name,
          objective: c.objective,
          status: c.status,
          effectiveStatus: c.effective_status,
          dailyBudget: toBudget(c.daily_budget),
          lifetimeBudget: toBudget(c.lifetime_budget),
          budgetRemaining: toNumber(c.budget_remaining),
          bidStrategy: c.bid_strategy,
          specialAdCategories:
            c.special_ad_categories && c.special_ad_categories.length > 0
              ? c.special_ad_categories
              : undefined,
          startTime: c.start_time,
          stopTime: c.stop_time,
          updatedTime: c.updated_time,
        }),
      );
      return listResult(page, items);
    },
  });
}
