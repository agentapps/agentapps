import type { AgentApp } from '@agentapps/sdk';
import { type Args, numericId } from '../lib/args.js';
import { patchEntity } from '../lib/writes.js';

export function registerPauseCampaignTool(app: AgentApp): void {
  app.tool('pause-campaign', {
    description:
      'Pause one LinkedIn campaign (status PAUSED): it stops serving and spending until ' +
      'activated again with activate-campaign. Its creatives and settings are kept. Returns ' +
      '{ success, id, accountId, status }.',
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
      // Reversible with activate-campaign and it stops spend, so not destructive.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const accountId = numericId(a.accountId, 'accountId', 'sponsoredAccount');
      const id = numericId(a.campaignId, 'campaignId', 'sponsoredCampaign');
      await patchEntity(ctx, `/adAccounts/${accountId}/adCampaigns/${id}`, { status: 'PAUSED' });
      return {
        success: true,
        id,
        accountId,
        status: 'PAUSED',
        message: 'Campaign paused: it no longer serves or spends.',
      };
    },
  });
}
