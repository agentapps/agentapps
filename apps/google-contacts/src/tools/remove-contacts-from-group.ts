import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

interface ModifyMembersResponse {
  notFoundResourceNames?: string[];
}

/**
 * remove-contacts-from-group — POST /contactGroups/{resourceName}/members:modify.
 *
 * Removes one or more contacts from a contact group.
 */
export function registerRemoveContactsFromGroupTool(app: AgentApp): void {
  app.tool('remove-contacts-from-group', {
    description:
      "Remove one or more contacts from a contact group (POST /contactGroups/{resourceName}/members:modify). Returns { success, notFoundResourceNames }. Params: resourceName (required — e.g. 'contactGroups/abc123'), contactResourceNames (required — array of contact resource names e.g. ['people/c123', 'people/c456']).",
    parameters: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: "Contact group resource name (e.g., 'contactGroups/abc123')",
        },
        contactResourceNames: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Array of contact resource names to remove (e.g., ['people/c123', 'people/c456'])",
        },
      },
      required: ['resourceName', 'contactResourceNames'],
    },
    // Reversible with add-contacts-to-group; the contacts themselves are not deleted.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const resourceName = args.resourceName as string;
      const contactResourceNames = args.contactResourceNames as string[];
      if (!resourceName || typeof resourceName !== 'string') {
        throw new Error('resourceName is required.');
      }
      if (!Array.isArray(contactResourceNames) || contactResourceNames.length === 0) {
        throw new Error('contactResourceNames is required and must be a non-empty array.');
      }

      const response = await googlePeopleRequest<ModifyMembersResponse>(
        ctx,
        `/${resourceName}/members:modify`,
        {
          method: 'POST',
          body: {
            resourceNamesToRemove: contactResourceNames,
          },
        },
      );

      return {
        success: true,
        message: `Removed ${contactResourceNames.length} contact(s) from group`,
        notFoundResourceNames: response.notFoundResourceNames ?? [],
      };
    },
  });
}
