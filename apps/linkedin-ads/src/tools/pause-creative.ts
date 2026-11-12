import type { AgentApp } from '@agentapps/sdk';
import { type Args, numericId } from '../lib/args.js';
import { urn } from '../lib/client.js';
import { patchEntity } from '../lib/writes.js';

export function registerPauseCreativeTool(app: AgentApp): void {
  app.tool('pause-creative', {
    description:
      'Pause one LinkedIn creative (ad): intendedStatus PAUSED, so it stops serving while ' +
      'the rest of its campaign keeps running. Undo with activate-creative. A creative still in ' +
      'review cannot be paused (LinkedIn answers 400). Returns { success, id, accountId, ' +
      'intendedStatus }.',
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
      // Reversible with activate-creative and it stops the ad, so not destructive.
      destructiveHint: false,
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
        intendedStatus: 'PAUSED',
      });
      return {
        success: true,
        id,
        accountId,
        intendedStatus: 'PAUSED',
        message: 'Creative paused: it no longer serves.',
      };
    },
  });
}
