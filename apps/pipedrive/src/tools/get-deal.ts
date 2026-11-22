/**
 * get-deal — get a single deal by ID from Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerGetDealTool(app: AgentApp): void {
  app.tool('get-deal', {
    description:
      'Get details of a specific deal by its ID, including associated contacts and organization.',
    parameters: {
      type: 'object',
      properties: {
        dealId: {
          type: 'number',
          description: 'The ID of the deal to retrieve.',
        },
      },
      required: ['dealId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const dealId = args.dealId as number;
      return await pipedriveRequest('GET', `/deals/${dealId}`, {}, ctx);
    },
  });
}
