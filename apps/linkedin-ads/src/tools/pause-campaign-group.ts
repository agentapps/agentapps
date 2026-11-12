import type { AgentApp } from '@agentapps/sdk';
import { type Args, numericId } from '../lib/args.js';
import { patchEntity } from '../lib/writes.js';

export function registerPauseCampaignGroupTool(app: AgentApp): void {
  app.tool('pause-campaign-group', {
    description:
      'Pause one LinkedIn campaign group (status PAUSED): none of its campaigns serve or ' +
      'spend until it is activated again with activate-campaign-group. Returns { success, id, ' +
      'accountId, status }.',
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
      // Reversible with activate-campaign-group and it stops spend, so not destructive.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const accountId = numericId(a.accountId, 'accountId', 'sponsoredAccount');
      const id = numericId(a.campaignGroupId, 'campaignGroupId', 'sponsoredCampaignGroup');
      await patchEntity(ctx, `/adAccounts/${accountId}/adCampaignGroups/${id}`, {
        status: 'PAUSED',
      });
      return {
        success: true,
        id,
        accountId,
        status: 'PAUSED',
        message: 'Campaign group paused: its campaigns no longer serve or spend.',
      };
    },
  });
}
