/**
 * delete-deal — delete a deal from Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerDeleteDealTool(app: AgentApp): void {
  app.tool('delete-deal', {
    description: 'Delete a deal from Pipedrive by its ID. This action is irreversible.',
    parameters: {
      type: 'object',
      properties: {
        dealId: {
          type: 'number',
          description: 'The ID of the deal to delete.',
        },
      },
      required: ['dealId'],
    },
    annotations: { sensitive: true, readOnlyHint: false, idempotentHint: true },
    handler: async (args, ctx) => {
      const dealId = args.dealId as number;
      return await pipedriveRequest('DELETE', `/deals/${dealId}`, {}, ctx);
    },
  });
}
