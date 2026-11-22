/**
 * get-contact — GET /marketing/contacts/{id}
 *
 * Retrieve a specific contact by ID from SendGrid Marketing Campaigns.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

export function registerGetContactTool(app: AgentApp): void {
  app.tool('get-contact', {
    description:
      'Get a specific contact by ID from SendGrid Marketing Campaigns (GET /marketing/contacts/{id}). Returns the full contact object.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The ID of the contact to retrieve.',
        },
      },
      required: ['id'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const id = args.id as string;

      if (!id) {
        throw new Error('Contact id is required.');
      }

      const res = await sendgridRequest(
        'GET',
        `/marketing/contacts/${encodeURIComponent(id)}`,
        null,
        ctx,
      );

      return res;
    },
  });
}
