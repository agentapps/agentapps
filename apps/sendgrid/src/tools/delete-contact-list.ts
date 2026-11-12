/**
 * delete-contact-list — DELETE /marketing/lists/{id}
 *
 * Delete a contact list from SendGrid Marketing Campaigns.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

export function registerDeleteContactListTool(app: AgentApp): void {
  app.tool('delete-contact-list', {
    description:
      'Delete a contact list from SendGrid Marketing Campaigns (DELETE /marketing/lists/{id}). This removes the list but does not delete the contacts in it.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The ID of the contact list to delete.',
        },
        deleteContacts: {
          type: 'boolean',
          description: 'If true, also delete all contacts on the list. Defaults to false.',
        },
      },
      required: ['id'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const id = args.id as string;
      const deleteContacts = (args.deleteContacts as boolean) ?? false;

      if (!id) {
        throw new Error('Contact list id is required.');
      }

      const path = `/marketing/lists/${encodeURIComponent(id)}?delete_contacts=${deleteContacts}`;

      const res = await sendgridRequest('DELETE', path, null, ctx);

      return res;
    },
  });
}
