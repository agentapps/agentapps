import type { AgentApp } from '@agentapps/sdk';
import { type Args, numericId } from '../lib/args.js';
import { patchEntity } from '../lib/writes.js';

export function registerActivateCampaignGroupTool(app: AgentApp): void {
  app.tool('activate-campaign-group', {
    description:
      'Activate one LinkedIn campaign group (status ACTIVE). AFFECTS SPEND: its ACTIVE ' +
      'campaigns start serving and are billed up to their budgets. Check them with ' +
      'list-campaigns first. Returns { success, id, accountId, status }.',
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
      },
      required: ['accountId', 'campaignGroupId'],
    },
    annotations: {
      readOnlyHint: false,
      // Starts spending real money: money spent cannot be undone.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const accountId = numericId(a.accountId, 'accountId', 'sponsoredAccount');
      const id = numericId(a.campaignGroupId, 'campaignGroupId', 'sponsoredCampaignGroup');
      await patchEntity(ctx, `/adAccounts/${accountId}/adCampaignGroups/${id}`, {
        status: 'ACTIVE',
      });
      return {
        success: true,
        id,
        accountId,
        status: 'ACTIVE',
        message: 'Campaign group activated: its active campaigns can now serve and spend.',
      };
    },
  });
}
