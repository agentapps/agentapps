/**
 * get-contact-list — GET /marketing/lists/{id}
 *
 * Retrieve a specific contact list by ID from SendGrid Marketing Campaigns.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

export function registerGetContactListTool(app: AgentApp): void {
  app.tool('get-contact-list', {
    description:
      'Get a specific contact list by ID from SendGrid Marketing Campaigns (GET /marketing/lists/{id}). Returns the list details including name, contact count, and metadata.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The ID of the contact list to retrieve.',
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
        throw new Error('Contact list id is required.');
      }

      const res = await sendgridRequest(
        'GET',
        `/marketing/lists/${encodeURIComponent(id)}`,
        null,
        ctx,
      );

      return res;
    },
  });
}
