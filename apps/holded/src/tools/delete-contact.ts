/**
 * delete-contact — delete a Holded contact by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerDeleteContactTool(app: AgentApp): void {
  app.tool('delete-contact', {
    description: 'Delete a contact from your Holded account.',
    parameters: {
      type: 'object',
      properties: {
        contactId: {
          type: 'string',
          description: 'The Holded contact ID to delete.',
        },
      },
      required: ['contactId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const contactId = args.contactId as string;
      return await holdedRequest('DELETE', `invoicing/v1/contacts/${contactId}`, null, ctx);
    },
  });
}
