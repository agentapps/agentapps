import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * list-organizations — GET /organizations.json.
 */
export function registerListOrganizationsTool(app: AgentApp): void {
  app.tool('list-organizations', {
    description:
      'List Zendesk organizations. Returns curated rows { id, name, domainNames, tags, createdAt }. Params: limit (1-100, def 30), page.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Results per page. Min 1, max 100, default 30.',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination. Default 1.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { limit, page } = (args ?? {}) as {
        limit?: number;
        page?: number;
      };

      const result = await zendeskRequest<any>(ctx, '/organizations.json', {
        query: {
          per_page: Math.min(limit ?? 30, 100),
          page: page ?? 1,
        },
      });

      const organizations = (result.organizations ?? []).map((o: any) => ({
        id: o.id,
        name: o.name,
        domainNames: o.domain_names ?? [],
        tags: o.tags ?? [],
        createdAt: o.created_at,
        updatedAt: o.updated_at,
        url: o.url,
      }));

      return {
        organizations,
        total: organizations.length,
        page: page ?? 1,
        hasMore: result.next_page != null,
      };
    },
  });
}
