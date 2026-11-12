/**
 * get_contact — retrieve a single Holded contact by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerGetContactTool(app: AgentApp): void {
  app.tool('get_contact', {
    description: 'Get detailed information about a specific Holded contact.',
    parameters: {
      type: 'object',
      properties: {
        contactId: {
          type: 'string',
          description: 'The Holded contact ID.',
        },
      },
      required: ['contactId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const contactId = args.contactId as string;
      return await holdedRequest('GET', `invoicing/v1/contacts/${contactId}`, null, ctx);
    },
  });
}
