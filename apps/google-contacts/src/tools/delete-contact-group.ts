import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

/**
 * delete-contact-group — DELETE /contactGroups/{resourceName}.
 *
 * Deletes a contact group. By default, contacts in the group are NOT deleted.
 * Set deleteContacts=true to also delete the contacts.
 */
export function registerDeleteContactGroupTool(app: AgentApp): void {
  app.tool('delete-contact-group', {
    description:
      "Delete a contact group from Google Contacts (DELETE /contactGroups/{resourceName}). By default this does NOT delete the contacts in the group. Set deleteContacts=true to also delete them. IRREVERSIBLE. Returns { resourceName, deleted, contactsDeleted }. Params: resourceName (required — e.g. 'contactGroups/abc123'), deleteContacts? (default false).",
    parameters: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: "Contact group resource name (e.g., 'contactGroups/abc123')",
        },
        deleteContacts: {
          type: 'boolean',
          description: 'If true, also delete the contacts in this group (default: false)',
        },
      },
      required: ['resourceName'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const resourceName = args.resourceName as string;
      if (!resourceName || typeof resourceName !== 'string') {
        throw new Error('resourceName is required.');
      }
      const deleteContacts = (args.deleteContacts as boolean) ?? false;

      await googlePeopleRequest(ctx, `/${resourceName}`, {
        method: 'DELETE',
        query: { deleteContacts },
      });

      return {
        resourceName,
        deleted: true,
        contactsDeleted: deleteContacts,
      };
    },
  });
}
