import type { AgentApp } from '@agentapps/sdk';
import { type Args, numericId } from '../lib/args.js';
import { patchEntity } from '../lib/writes.js';

export function registerActivateCampaignTool(app: AgentApp): void {
  app.tool('activate-campaign', {
    description:
      'Activate one LinkedIn campaign (status ACTIVE). AFFECTS SPEND: once active the ' +
      'campaign serves ads and is billed up to its budget (LinkedIn may spend up to 150% of a ' +
      'daily budget on a given day). Check budget and schedule with get-campaign first. A ' +
      'COMPLETED campaign needs a new end date in Campaign Manager. Returns { success, id, ' +
      'accountId, status }.',
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
      },
      required: ['accountId', 'campaignId'],
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
      const id = numericId(a.campaignId, 'campaignId', 'sponsoredCampaign');
      await patchEntity(ctx, `/adAccounts/${accountId}/adCampaigns/${id}`, { status: 'ACTIVE' });
      return {
        success: true,
        id,
        accountId,
        status: 'ACTIVE',
        message: 'Campaign activated: it can now serve and spend up to its budget.',
      };
    },
  });
}
