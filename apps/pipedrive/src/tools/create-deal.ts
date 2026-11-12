/**
 * create-deal — create a new deal in Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerCreateDealTool(app: AgentApp): void {
  app.tool('create-deal', {
    description: 'Create a new deal in Pipedrive. Returns the created deal object.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title/name of the deal (required).',
        },
        value: {
          type: 'number',
          description: 'The monetary value of the deal.',
        },
        currency: {
          type: 'string',
          description: 'The currency code (e.g. USD, EUR). Defaults to account currency.',
        },
        person_id: {
          type: 'number',
          description: 'ID of the person (contact) to associate with this deal.',
        },
        org_id: {
          type: 'number',
          description: 'ID of the organization to associate with this deal.',
        },
      },
      required: ['title'],
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = { title: args.title };
      if (args.value !== undefined) body.value = args.value;
      if (args.currency) body.currency = args.currency;
      if (args.person_id) body.person_id = args.person_id;
      if (args.org_id) body.org_id = args.org_id;

      return await pipedriveRequest('POST', '/deals', { body }, ctx);
    },
  });
}
