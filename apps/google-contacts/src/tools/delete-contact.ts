import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

/**
 * delete-contact — DELETE /people/{resourceName}:deleteContact.
 *
 * Permanently deletes a contact. IRREVERSIBLE.
 */
export function registerDeleteContactTool(app: AgentApp): void {
  app.tool('delete-contact', {
    description:
      "Delete a contact permanently from Google Contacts (DELETE /people/{resourceName}:deleteContact). IRREVERSIBLE — the contact is removed. Returns { resourceName, deleted }. Params: resourceName (required — e.g. 'people/c123456789').",
    parameters: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: "Contact resource name (e.g., 'people/c123456789')",
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

      await googlePeopleRequest(ctx, `/${resourceName}:deleteContact`, { method: 'DELETE' });

      return {
        resourceName,
        deleted: true,
      };
    },
  });
}
