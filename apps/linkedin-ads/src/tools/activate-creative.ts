import type { AgentApp } from '@agentapps/sdk';
import { type Args, numericId } from '../lib/args.js';
import { urn } from '../lib/client.js';
import { patchEntity } from '../lib/writes.js';

export function registerActivateCreativeTool(app: AgentApp): void {
  app.tool('activate-creative', {
    description:
      'Activate one LinkedIn creative (ad): intendedStatus ACTIVE. AFFECTS SPEND: if its ' +
      'campaign is active the ad serves and is billed; a DRAFT creative goes to LinkedIn review ' +
      'first. Returns { success, id, accountId, intendedStatus }.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: ['string', 'number'],
          description: 'Ad account id from list-ad-accounts.',
        },
        creativeId: {
          type: ['string', 'number'],
          description:
            'Creative id from list-creatives (digits, or urn:li:sponsoredCreative:<id>).',
        },
      },
      required: ['accountId', 'creativeId'],
    },
    annotations: {
      readOnlyHint: false,
      // Lets a live campaign spend on this ad: money spent cannot be undone.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const accountId = numericId(a.accountId, 'accountId', 'sponsoredAccount');
      const id = numericId(a.creativeId, 'creativeId', 'sponsoredCreative');
      // Creatives are keyed by their URN, percent-encoded in the path.
      await patchEntity(ctx, `/adAccounts/${accountId}/creatives/${urn('sponsoredCreative', id)}`, {
        intendedStatus: 'ACTIVE',
      });
      return {
        success: true,
        id,
        accountId,
        intendedStatus: 'ACTIVE',
        message: 'Creative activated: it serves (after review) whenever its campaign is active.',
      };
    },
  });
}
