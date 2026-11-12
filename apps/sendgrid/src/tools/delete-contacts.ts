/**
 * delete-contacts — DELETE /marketing/contacts?ids={id1},{id2}
 *
 * Delete one or more contacts from SendGrid Marketing Campaigns.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

export function registerDeleteContactsTool(app: AgentApp): void {
  app.tool('delete-contacts', {
    description:
      'Delete one or more contacts from SendGrid Marketing Campaigns (DELETE /marketing/contacts?ids=...). Accepts an array of contact IDs.',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          description: 'Array of contact IDs to delete.',
          items: { type: 'string' },
        },
      },
      required: ['ids'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const ids = args.ids as string[];

      if (!ids || ids.length === 0) {
        throw new Error('At least one contact ID is required.');
      }

      const query = ids.map((id) => encodeURIComponent(id)).join(',');

      const res = await sendgridRequest('DELETE', `/marketing/contacts?ids=${query}`, null, ctx);

      return res;
    },
  });
}
