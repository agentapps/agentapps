import type { AgentApp } from '@agentapps/sdk';
import { asArgs, readAccountId, readBoolean, readId, readInt, readString } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { compact, type GraphPage, listResult, toBudget, toNumber } from '../lib/results.js';
import { readStatuses, STATUSES_PARAMETER } from '../lib/status.js';
import { READ_ONLY } from './annotations.js';

interface RawAdSet {
  id: string;
  name?: string;
  campaign_id?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_strategy?: string;
  bid_amount?: number;
  start_time?: string;
  end_time?: string;
  targeting?: Record<string, unknown>;
}

export function registerListAdSetsTool(app: AgentApp): void {
  app.tool('list-ad-sets', {
    description:
      'List ad sets of one campaign (campaignId) or of a whole ad account (accountId). Returns items with id, name, campaignId, status, effectiveStatus, dailyBudget / lifetimeBudget / budgetRemaining in minor units (cents; absent when the campaign carries the budget), optimizationGoal, billingEvent, bidStrategy, bidAmount, startTime and endTime; targeting only with includeTargeting:true (it can be large). Max 100 per page; page with `after`.',
    parameters: {
      type: 'object',
      properties: {
        campaignId: {
          type: ['string', 'number'],
          description:
            'Campaign id (digits). Ids have up to 18 digits: pass them as strings, in a JSON object on the CLI.',
        },
        accountId: {
          type: ['string', 'number'],
          description: 'Ad account id (act_<digits>), used when campaignId is not given.',
        },
        statuses: STATUSES_PARAMETER,
        includeTargeting: {
          type: 'boolean',
          description: "Also return each ad set's targeting spec (default false).",
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Ad sets per page (default 50, max 100; lower it with includeTargeting).',
        },
        after: { type: 'string', description: 'The nextCursor from a previous call.' },
      },
    },
    annotations: READ_ONLY,
    handler: async (args, ctx) => {
      const a = asArgs(args);
      const campaignId = readId(a, 'campaignId');
      const accountId = campaignId ? undefined : readAccountId(a, 'accountId', false);
      if (!campaignId && !accountId) {
        throw new Error('[BAD_REQUEST] Give campaignId (ad sets of one campaign) or accountId.');
      }
      const includeTargeting = readBoolean(a, 'includeTargeting', false);
      const fields = [
        'id',
        'name',
        'campaign_id',
        'status',
        'effective_status',
        'daily_budget',
        'lifetime_budget',
        'budget_remaining',
        'optimization_goal',
        'billing_event',
        'bid_strategy',
        'bid_amount',
        'start_time',
        'end_time',
      ];
      if (includeTargeting) fields.push('targeting');
      const page = await apiRequest<GraphPage<RawAdSet>>(
        'GET',
        `/${campaignId ?? accountId}/adsets`,
        ctx,
        {
          params: {
            fields,
            effective_status: readStatuses(a),
            limit: readInt(a, 'limit', { min: 1, max: 100, fallback: 50 }),
            after: readString(a, 'after', { max: 500 }),
          },
        },
      );
      const items = (page.data ?? []).map((s) =>
        compact({
          id: s.id,
          name: s.name,
          campaignId: s.campaign_id,
          status: s.status,
          effectiveStatus: s.effective_status,
          dailyBudget: toBudget(s.daily_budget),
          lifetimeBudget: toBudget(s.lifetime_budget),
          budgetRemaining: toNumber(s.budget_remaining),
          optimizationGoal: s.optimization_goal,
          billingEvent: s.billing_event,
          bidStrategy: s.bid_strategy,
          bidAmount: s.bid_amount,
          startTime: s.start_time,
          endTime: s.end_time,
          targeting: includeTargeting ? s.targeting : undefined,
        }),
      );
      return listResult(page, items);
    },
  });
}
