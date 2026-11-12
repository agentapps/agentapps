import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

interface ContactGroupResponse {
  resourceName?: string;
  name?: string;
  formattedName?: string;
  groupType?: string;
  metadata?: unknown;
}

/**
 * create-contact-group — POST /contactGroups.
 *
 * Creates a new contact group (label) in Google Contacts.
 */
export function registerCreateContactGroupTool(app: AgentApp): void {
  app.tool('create-contact-group', {
    description:
      'Create a new contact group (label) in Google Contacts (POST /contactGroups). Returns { resourceName, name, formattedName, groupType }. Params: name (required — must be unique).',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the contact group (must be unique)',
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
      if (!name || typeof name !== 'string') {
        throw new Error('name is required.');
      }

      const group = await googlePeopleRequest<ContactGroupResponse>(ctx, '/contactGroups', {
        method: 'POST',
        body: {
          contactGroup: { name },
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
