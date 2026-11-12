/**
 * create-contact-list — POST /marketing/lists
 *
 * Create a new contact list in SendGrid Marketing Campaigns.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

export function registerCreateContactListTool(app: AgentApp): void {
  app.tool('create-contact-list', {
    description:
      'Create a new contact list in SendGrid Marketing Campaigns (POST /marketing/lists). Returns the created list.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the new contact list.',
        },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const name = args.name as string;

      if (!name || name.trim().length === 0) {
        throw new Error('List name is required.');
      }

      const res = await sendgridRequest('POST', '/marketing/lists', { name: name.trim() }, ctx);

      return res;
    },
  });
}
