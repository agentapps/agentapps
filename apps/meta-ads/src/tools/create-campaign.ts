import type { AgentApp } from '@agentapps/sdk';
import {
  asArgs,
  readAccountId,
  readBoolean,
  readBudget,
  readEnum,
  readList,
  readString,
} from '../lib/args.js';
import { apiRequest } from '../lib/client.js';

/** The outcome-based objectives Meta accepts for new campaigns. */
const OBJECTIVES = [
  'OUTCOME_AWARENESS',
  'OUTCOME_TRAFFIC',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_LEADS',
  'OUTCOME_APP_PROMOTION',
  'OUTCOME_SALES',
] as const;

const SPECIAL_AD_CATEGORIES = [
  'NONE',
  'EMPLOYMENT',
  'HOUSING',
  'CREDIT',
  'ISSUES_ELECTIONS_POLITICS',
  'ONLINE_GAMBLING_AND_GAMING',
  'FINANCIAL_PRODUCTS_SERVICES',
] as const;

export const BID_STRATEGIES = [
  'LOWEST_COST_WITHOUT_CAP',
  'LOWEST_COST_WITH_BID_CAP',
  'COST_CAP',
  'LOWEST_COST_WITH_MIN_ROAS',
] as const;

export function registerCreateCampaignTool(app: AgentApp): void {
  app.tool('create-campaign', {
    description:
      'Create a campaign in an ad account. It is always created PAUSED, so it spends nothing until someone activates it with activate-ad-object. Give a campaign budget (dailyBudget or lifetimeBudget, minor units: cents) to let Meta spread it across the ad sets, or leave both out and give each ad set its own budget in create-ad-set. Ads that relate to employment, housing, credit, politics, gambling or financial products must declare specialAdCategories. Returns { success, id, name, status: "PAUSED" }; next, add ad sets with create-ad-set.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: ['string', 'number'],
          description: 'Ad account id, act_<digits> or just the digits.',
        },
        name: { type: 'string', maxLength: 400, description: 'Campaign name.' },
        objective: {
          type: 'string',
          enum: [...OBJECTIVES],
          description: 'What the campaign optimises for.',
        },
        specialAdCategories: {
          type: 'array',
          items: { type: 'string', enum: [...SPECIAL_AD_CATEGORIES] },
          description: 'Declared special ad categories (default none).',
        },
        specialAdCategoryCountries: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Two-letter country codes where the special ad category applies (with specialAdCategories).',
        },
        dailyBudget: {
          type: 'integer',
          minimum: 1,
          description: 'Campaign daily budget in minor units (cents). Not with lifetimeBudget.',
        },
        lifetimeBudget: {
          type: 'integer',
          minimum: 1,
          description:
            'Campaign lifetime budget in minor units (cents). Its ad sets then need an end time.',
        },
        bidStrategy: {
          type: 'string',
          enum: [...BID_STRATEGIES],
          description: "Bid strategy for a campaign budget (default: Meta's lowest cost).",
        },
        adSetBudgetSharing: {
          type: 'boolean',
          description:
            'Without a campaign budget only: let ad sets share up to 20% of their budgets (default false).',
        },
      },
      required: ['accountId', 'name', 'objective'],
    },
    annotations: {
      readOnlyHint: false,
      // Created PAUSED: nothing is spent and nothing existing changes.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = asArgs(args);
      const accountId = readAccountId(a) as string;
      const name = readString(a, 'name', { required: true, max: 400 });
      const objective = readEnum(a, 'objective', OBJECTIVES);
      if (!objective) {
        throw new Error(`[BAD_REQUEST] objective is required: one of ${OBJECTIVES.join(', ')}.`);
      }
      const categories = (
        readList(a, 'specialAdCategories', {
          pattern: /^[A-Za-z_]+$/,
          max: SPECIAL_AD_CATEGORIES.length,
          describe: `one of ${SPECIAL_AD_CATEGORIES.join(', ')}`,
        }) ?? []
      )
        .map((c) => c.toUpperCase())
        .filter((c) => c !== 'NONE');
      for (const c of categories) {
        if (!(SPECIAL_AD_CATEGORIES as readonly string[]).includes(c)) {
          throw new Error(
            `[BAD_REQUEST] specialAdCategories item ${JSON.stringify(c)} is not one of ${SPECIAL_AD_CATEGORIES.join(', ')}.`,
          );
        }
      }
      const countries = readList(a, 'specialAdCategoryCountries', {
        pattern: /^[A-Za-z]{2}$/,
        max: 250,
        describe: 'a two-letter country code',
      })?.map((c) => c.toUpperCase());
      const daily = readBudget(a, 'dailyBudget');
      const lifetime = readBudget(a, 'lifetimeBudget');
      if (daily !== undefined && lifetime !== undefined) {
        throw new Error('[BAD_REQUEST] Give dailyBudget or lifetimeBudget, not both.');
      }
      const hasCampaignBudget = daily !== undefined || lifetime !== undefined;
      const bidStrategy = readEnum(a, 'bidStrategy', BID_STRATEGIES);
      if (bidStrategy && !hasCampaignBudget) {
        throw new Error(
          '[BAD_REQUEST] bidStrategy applies to a campaign budget; without one, set it per ad set in create-ad-set.',
        );
      }
      const sharing = readBoolean(a, 'adSetBudgetSharing', false);
      if (sharing && hasCampaignBudget) {
        throw new Error(
          '[BAD_REQUEST] adSetBudgetSharing only applies when the ad sets carry the budget; leave out the campaign budget or the sharing.',
        );
      }

      const created = await apiRequest<{ id: string }>('POST', `/${accountId}/campaigns`, ctx, {
        form: {
          name,
          objective,
          // Always paused: activating is a separate, explicit step (activate-ad-object).
          status: 'PAUSED',
          special_ad_categories: categories,
          special_ad_category_country: countries,
          daily_budget: daily,
          lifetime_budget: lifetime,
          bid_strategy: bidStrategy,
          // Since v24.0 Meta requires this field whenever the budget sits on the ad sets.
          is_adset_budget_sharing_enabled: hasCampaignBudget ? undefined : sharing,
        },
      });
      return { success: true, id: String(created.id), name, accountId, status: 'PAUSED' };
    },
  });
}
