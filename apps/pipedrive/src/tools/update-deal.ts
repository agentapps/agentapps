/**
 * update-deal — update an existing deal in Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerUpdateDealTool(app: AgentApp): void {
  app.tool('update-deal', {
    description:
      'Update an existing deal in Pipedrive. Supports changing title, value, and status.',
    parameters: {
      type: 'object',
      properties: {
        dealId: {
          type: 'number',
          description: 'The ID of the deal to update.',
        },
        title: {
          type: 'string',
          description: 'New title for the deal.',
        },
        value: {
          type: 'number',
          description: 'New monetary value of the deal.',
        },
        status: {
          type: 'string',
          description: 'New status: open, won, lost, or deleted.',
          enum: ['open', 'won', 'lost', 'deleted'],
        },
      },
      required: ['dealId'],
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
    handler: async (args, ctx) => {
      const dealId = args.dealId as number;
      const body: Record<string, unknown> = {};
      if (args.title) body.title = args.title;
      if (args.value !== undefined) body.value = args.value;
      if (args.status) body.status = args.status;

      return await pipedriveRequest('PUT', `/deals/${dealId}`, { body }, ctx);
    },
  });
}
