import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

interface ModifyMembersResponse {
  notFoundResourceNames?: string[];
  canNotAddResourceNames?: string[];
}

/**
 * add-contacts-to-group — POST /contactGroups/{resourceName}/members:modify.
 *
 * Adds one or more contacts to a contact group.
 */
export function registerAddContactsToGroupTool(app: AgentApp): void {
  app.tool('add-contacts-to-group', {
    description:
      "Add one or more contacts to a contact group (POST /contactGroups/{resourceName}/members:modify). Returns { success, notFoundResourceNames, canNotAddResourceNames }. Params: resourceName (required — e.g. 'contactGroups/abc123'), contactResourceNames (required — array of contact resource names e.g. ['people/c123', 'people/c456']).",
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
            "Array of contact resource names to add (e.g., ['people/c123', 'people/c456'])",
        },
      },
      required: ['resourceName', 'contactResourceNames'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
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
            resourceNamesToAdd: contactResourceNames,
          },
        },
      );

      return {
        success: true,
        message: `Added ${contactResourceNames.length} contact(s) to group`,
        notFoundResourceNames: response.notFoundResourceNames ?? [],
        canNotAddResourceNames: response.canNotAddResourceNames ?? [],
      };
    },
  });
}
