import type { AgentApp } from '@agentapps/sdk';
import { fetchAdObject, OBJECT_LEVELS, readTarget } from '../lib/ad-objects.js';
import { asArgs } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';

export function registerActivateAdObjectTool(app: AgentApp): void {
  app.tool('activate-ad-object', {
    description:
      'Activate a campaign, ad set or ad (sets its status to ACTIVE). THIS STARTS SPENDING MONEY: once delivery starts, the spend cannot be undone. Delivery also needs its parent campaign and ad set to be active and the ad to pass review: check effectiveStatus with list-campaigns, list-ad-sets or list-ads afterwards. Checks first that the id is of the given level. Returns { success, id, name, level, previousStatus, status }.',
    parameters: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          enum: [...OBJECT_LEVELS],
          description: 'What the id is: campaign, adset or ad.',
        },
        id: {
          type: ['string', 'number'],
          description: 'Its id (digits; pass as a string, ids have up to 18 digits).',
        },
      },
      required: ['level', 'id'],
    },
    annotations: {
      readOnlyHint: false,
      // Starts real ad spend, which cannot be taken back once it has happened.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { level, id } = readTarget(asArgs(args));
      const current = await fetchAdObject(ctx, level, id);
      if (current.status === 'ACTIVE') {
        return {
          success: true,
          id,
          name: current.name,
          level,
          previousStatus: 'ACTIVE',
          status: 'ACTIVE',
          effectiveStatus: current.effective_status,
          changed: false,
        };
      }
      await apiRequest('POST', `/${id}`, ctx, { form: { status: 'ACTIVE' } });
      return {
        success: true,
        id,
        name: current.name,
        level,
        previousStatus: current.status,
        status: 'ACTIVE',
        changed: true,
      };
    },
  });
}
