import type { AgentApp } from '@agentapps/sdk';
import { fetchAdObject, OBJECT_LEVELS, readTarget } from '../lib/ad-objects.js';
import { asArgs } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';

export function registerPauseAdObjectTool(app: AgentApp): void {
  app.tool('pause-ad-object', {
    description:
      'Pause a campaign, ad set or ad (sets its status to PAUSED). Pausing a campaign or ad set also stops everything under it. Reversible with activate-ad-object. Checks first that the id is of the given level. Returns { success, id, name, level, previousStatus, status }.',
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
      // Stops spend and can be undone with activate-ad-object.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { level, id } = readTarget(asArgs(args));
      const current = await fetchAdObject(ctx, level, id);
      if (current.status === 'PAUSED') {
        return {
          success: true,
          id,
          name: current.name,
          level,
          previousStatus: 'PAUSED',
          status: 'PAUSED',
          changed: false,
        };
      }
      await apiRequest('POST', `/${id}`, ctx, { form: { status: 'PAUSED' } });
      return {
        success: true,
        id,
        name: current.name,
        level,
        previousStatus: current.status,
        status: 'PAUSED',
        changed: true,
      };
    },
  });
}
