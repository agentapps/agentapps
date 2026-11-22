import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

interface ContactGroupDetailResponse {
  resourceName?: string;
  name?: string;
  formattedName?: string;
  groupType?: string;
  memberCount?: number;
  memberResourceNames?: string[];
  metadata?: unknown;
}

/**
 * get-contact-group — GET /contactGroups/{resourceName}.
 *
 * Gets detailed information about a specific contact group, including its members.
 */
export function registerGetContactGroupTool(app: AgentApp): void {
  app.tool('get-contact-group', {
    description:
      "Get detailed information about a specific contact group, including its members. Returns group name, type, member count, and member resource names. Params: resourceName (required — e.g. 'contactGroups/abc123'), maxMembers? (default 100, max 1000).",
    parameters: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: "Contact group resource name (e.g., 'contactGroups/abc123')",
        },
        maxMembers: {
          type: 'number',
          description: 'Maximum number of members to return (default: 100, max: 1000)',
        },
      },
      required: ['resourceName'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const resourceName = args.resourceName as string;
      if (!resourceName || typeof resourceName !== 'string') {
        throw new Error('resourceName is required.');
      }
      const maxMembers = Math.min(Number(args.maxMembers ?? 100), 1000);

      const group = await googlePeopleRequest<ContactGroupDetailResponse>(ctx, `/${resourceName}`, {
        query: {
          maxMembers,
          groupFields: 'name,groupType,memberCount,metadata,clientData',
        },
      });

      return {
        resourceName: group.resourceName,
        name: group.name,
        formattedName: group.formattedName,
        groupType: group.groupType,
        memberCount: group.memberCount ?? 0,
        memberResourceNames: group.memberResourceNames ?? [],
        metadata: group.metadata,
      };
    },
  });
}
