import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * get-contact — GET /contacts/{contactId}
 *
 * Retrieves a single Freshdesk contact by their ID.
 */
export function registerGetContactTool(app: AgentApp): void {
  app.tool('get-contact', {
    description:
      'Get detailed information about a specific Freshdesk contact by their ID (GET /api/v2/contacts/{contactId}). Returns name, email, phone, company, and other profile fields.',
    parameters: {
      type: 'object',
      properties: {
        contactId: {
          type: 'number',
          description: 'The Freshdesk contact ID.',
        },
      },
      required: ['contactId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const contactId = args.contactId as number;
      return await freshdeskRequest('GET', `/contacts/${contactId}`, undefined, ctx);
    },
  });
}
