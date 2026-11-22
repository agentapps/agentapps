import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * get-organization — GET /organizations/{id}.json.
 */
export function registerGetOrganizationTool(app: AgentApp): void {
  app.tool('get-organization', {
    description:
      'Get a single Zendesk organization by ID with full details including domain names and tags.',
    parameters: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Zendesk organization ID.',
        },
      },
      required: ['organizationId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { organizationId } = args as { organizationId: string };

      const result = await zendeskRequest<any>(ctx, `/organizations/${organizationId}.json`);
      const o = result.organization;

      return {
        id: o.id,
        name: o.name,
        domainNames: o.domain_names ?? [],
        tags: o.tags ?? [],
        createdAt: o.created_at,
        updatedAt: o.updated_at,
        url: o.url,
      };
    },
  });
}
