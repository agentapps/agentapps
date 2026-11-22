import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

interface ContactGroupResponse {
  resourceName?: string;
  etag?: string;
  name?: string;
  formattedName?: string;
  groupType?: string;
  metadata?: unknown;
}

/**
 * update-contact-group — PUT /contactGroups/{resourceName}.
 *
 * Updates an existing contact group (renames it). Fetches the current group
 * first to get the etag.
 */
export function registerUpdateContactGroupTool(app: AgentApp): void {
  app.tool('update-contact-group', {
    description:
      "Update an existing contact group (rename it). Fetches the current group for the etag first. Returns { resourceName, name, formattedName, groupType }. Params: resourceName (required — e.g. 'contactGroups/abc123'), name (required — new name).",
    parameters: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: "Contact group resource name (e.g., 'contactGroups/abc123')",
        },
        name: {
          type: 'string',
          description: 'New name for the contact group',
        },
      },
      required: ['resourceName', 'name'],
    },
    // Renaming back undoes it.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const resourceName = args.resourceName as string;
      const name = args.name as string;
      if (!resourceName || typeof resourceName !== 'string') {
        throw new Error('resourceName is required.');
      }
      if (!name || typeof name !== 'string') {
        throw new Error('name is required.');
      }

      // Fetch the current group to get the etag.
      const currentGroup = await googlePeopleRequest<ContactGroupResponse>(
        ctx,
        `/${resourceName}`,
        {
          query: { groupFields: 'name,metadata' },
        },
      );

      const group = await googlePeopleRequest<ContactGroupResponse>(ctx, `/${resourceName}`, {
        method: 'PUT',
        body: {
          contactGroup: {
            name,
            etag: currentGroup.etag,
          },
          updateGroupFields: 'name',
        },
      });

      return {
        success: true,
        resourceName: group.resourceName,
        name: group.name,
        formattedName: group.formattedName,
        groupType: group.groupType,
        metadata: group.metadata,
      };
    },
  });
}
