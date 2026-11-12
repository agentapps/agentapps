import type { AgentApp } from '@agentapps/sdk';
import {
  asArgs,
  readAccountId,
  readBudget,
  readEnum,
  readId,
  readInt,
  readObject,
  readString,
} from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { BID_STRATEGIES } from './create-campaign.js';

const BILLING_EVENTS = [
  'IMPRESSIONS',
  'LINK_CLICKS',
  'THRUPLAY',
  'APP_INSTALLS',
  'PAGE_LIKES',
  'POST_ENGAGEMENT',
  'PURCHASE',
  'LISTING_INTERACTION',
] as const;

function readDateTime(a: Record<string, unknown>, key: string): string | undefined {
  const value = readString(a, key, { max: 40 });
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(
      `[BAD_REQUEST] ${key} must be an ISO 8601 date-time with a time zone, e.g. 2026-11-01T00:00:00+0100; got ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

export function registerCreateAdSetTool(app: AgentApp): void {
  app.tool('create-ad-set', {
    description:
      'Create an ad set inside a campaign. It is always created PAUSED, so it spends nothing until someone activates it (and its campaign) with activate-ad-object. Give dailyBudget or lifetimeBudget (minor units: cents) only when the campaign has no campaign budget; a lifetime budget needs endTime. targeting is Meta\'s targeting spec and needs at least geo_locations, e.g. {"geo_locations":{"countries":["ES"]},"age_min":18}. optimizationGoal must suit the campaign objective (e.g. LINK_CLICKS or LANDING_PAGE_VIEWS for OUTCOME_TRAFFIC, OFFSITE_CONVERSIONS with a pixel promotedObject for OUTCOME_SALES); Meta\'s error says which ones are allowed. Returns { success, id, name, campaignId, status: "PAUSED" }.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: ['string', 'number'],
          description: 'Ad account id, act_<digits> or just the digits.',
        },
        campaignId: {
          type: ['string', 'number'],
          description: 'Campaign id (digits; pass as a string, ids have up to 18 digits).',
        },
        name: { type: 'string', maxLength: 400, description: 'Ad set name.' },
        optimizationGoal: {
          type: 'string',
          description:
            'What delivery optimises for, e.g. LINK_CLICKS, LANDING_PAGE_VIEWS, REACH, IMPRESSIONS, OFFSITE_CONVERSIONS, LEAD_GENERATION, THRUPLAY.',
        },
        billingEvent: {
          type: 'string',
          enum: [...BILLING_EVENTS],
          description: 'What Meta charges for (default IMPRESSIONS).',
        },
        targeting: {
          type: 'object',
          description: 'Targeting spec with at least geo_locations (JSON object).',
        },
        dailyBudget: {
          type: 'integer',
          minimum: 1,
          description: 'Ad set daily budget in minor units (cents); not with a campaign budget.',
        },
        lifetimeBudget: {
          type: 'integer',
          minimum: 1,
          description: 'Ad set lifetime budget in minor units (cents); needs endTime.',
        },
        startTime: {
          type: 'string',
          description: 'ISO 8601 start, e.g. 2026-11-01T00:00:00+0100 (default: now).',
        },
        endTime: { type: 'string', description: 'ISO 8601 end (required with lifetimeBudget).' },
        bidStrategy: {
          type: 'string',
          enum: [...BID_STRATEGIES],
          description: 'Bid strategy when the ad set carries the budget.',
        },
        bidAmount: {
          type: 'integer',
          minimum: 1,
          description: 'Bid cap or cost cap in minor units (cents), for the capped strategies.',
        },
        promotedObject: {
          type: 'object',
          description:
            'What the ad set promotes, when the objective needs it, e.g. {"pixel_id":"123","custom_event_type":"PURCHASE"} or {"page_id":"123"}.',
        },
      },
      required: ['accountId', 'campaignId', 'name', 'optimizationGoal', 'targeting'],
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
      const campaignId = readId(a, 'campaignId', { required: true });
      const name = readString(a, 'name', { required: true, max: 400 });
      const optimizationGoal = readString(a, 'optimizationGoal', { required: true, max: 60 });
      if (!/^[A-Za-z_]+$/.test(optimizationGoal)) {
        throw new Error(
          `[BAD_REQUEST] optimizationGoal must be a Meta optimization goal such as LINK_CLICKS; got ${JSON.stringify(optimizationGoal)}.`,
        );
      }
      const billingEvent = readEnum(a, 'billingEvent', BILLING_EVENTS, 'IMPRESSIONS');
      const targeting = readObject(a, 'targeting', true) as Record<string, unknown>;
      if (!targeting.geo_locations || typeof targeting.geo_locations !== 'object') {
        throw new Error(
          '[BAD_REQUEST] targeting needs geo_locations, e.g. {"geo_locations":{"countries":["ES"]}}.',
        );
      }
      const daily = readBudget(a, 'dailyBudget');
      const lifetime = readBudget(a, 'lifetimeBudget');
      if (daily !== undefined && lifetime !== undefined) {
        throw new Error('[BAD_REQUEST] Give dailyBudget or lifetimeBudget, not both.');
      }
      const startTime = readDateTime(a, 'startTime');
      const endTime = readDateTime(a, 'endTime');
      if (lifetime !== undefined && !endTime) {
        throw new Error('[BAD_REQUEST] A lifetimeBudget needs endTime.');
      }
      const bidStrategy = readEnum(a, 'bidStrategy', BID_STRATEGIES);
      const bidAmount = readInt(a, 'bidAmount', { min: 1, max: Number.MAX_SAFE_INTEGER });
      const promotedObject = readObject(a, 'promotedObject');

      const created = await apiRequest<{ id: string }>('POST', `/${accountId}/adsets`, ctx, {
        form: {
          name,
          campaign_id: campaignId,
          // Always paused: activating is a separate, explicit step (activate-ad-object).
          status: 'PAUSED',
          optimization_goal: optimizationGoal.toUpperCase(),
          billing_event: billingEvent,
          targeting,
          daily_budget: daily,
          lifetime_budget: lifetime,
          start_time: startTime,
          end_time: endTime,
          bid_strategy: bidStrategy,
          bid_amount: bidAmount,
          promoted_object: promotedObject,
        },
      });
      return { success: true, id: String(created.id), name, campaignId, status: 'PAUSED' };
    },
  });
}
