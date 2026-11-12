import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

interface ContactGroupResource {
  resourceName?: string;
  name?: string;
  formattedName?: string;
  groupType?: string;
  memberCount?: number;
  metadata?: unknown;
}

interface ListContactGroupsResponse {
  contactGroups?: ContactGroupResource[];
  totalItems?: number;
  nextPageToken?: string;
}

/**
 * list-contact-groups — GET /contactGroups.
 *
 * Lists all contact groups (labels) for the authenticated user.
 */
export function registerListContactGroupsTool(app: AgentApp): void {
  app.tool('list-contact-groups', {
    description:
      'List all contact groups (labels) from Google Contacts. Returns group name, member count, and type. Supports pagination. Params: pageSize? (default 100, max 1000), pageToken?.',
    parameters: {
      type: 'object',
      properties: {
        pageSize: {
          type: 'number',
          description: 'Maximum number of groups to return (default: 100, max: 1000)',
        },
        pageToken: {
          type: 'string',
          description: 'Token for pagination (from previous response)',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const pageSize = Math.min(Number(args.pageSize ?? 100), 1000);
      const pageToken = args.pageToken as string | undefined;

      const response = await googlePeopleRequest<ListContactGroupsResponse>(ctx, '/contactGroups', {
        query: {
          pageSize,
          pageToken,
          groupFields: 'name,groupType,memberCount,metadata',
        },
      });

      const groups = (response.contactGroups ?? []).map((group) => ({
        resourceName: group.resourceName,
        name: group.name,
        formattedName: group.formattedName,
        groupType: group.groupType,
        memberCount: group.memberCount ?? 0,
        metadata: group.metadata,
      }));

      return {
        groups,
        totalItems: response.totalItems,
        nextPageToken: response.nextPageToken,
      };
    },
  });
}
