import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * list-users — GET /users.json or /users/search.json.
 */
export function registerListUsersTool(app: AgentApp): void {
  app.tool('list-users', {
    description:
      'List Zendesk users with optional filters. Returns curated rows { id, name, email, role, active, createdAt }. Params: role?, query?, limit (1-100, def 30), page.',
    parameters: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          enum: ['end-user', 'agent', 'admin'],
          description: 'Filter by user role.',
        },
        query: {
          type: 'string',
          description: 'Search query for user name or email.',
        },
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
      const { role, query, limit, page } = (args ?? {}) as {
        role?: string;
        query?: string;
        limit?: number;
        page?: number;
      };

      const perPage = Math.min(limit ?? 30, 100);
      const pageNum = page ?? 1;

      let result: any;

      if (query) {
        result = await zendeskRequest<any>(ctx, '/users/search.json', {
          query: { query, per_page: perPage, page: pageNum },
        });
      } else if (role) {
        result = await zendeskRequest<any>(ctx, '/users.json', {
          query: { role, per_page: perPage, page: pageNum },
        });
      } else {
        result = await zendeskRequest<any>(ctx, '/users.json', {
          query: { per_page: perPage, page: pageNum },
        });
      }

      const users = (result.users ?? []).map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
        tags: u.tags ?? [],
        organizationId: u.organization_id,
        url: u.url,
      }));

      return {
        users,
        total: users.length,
        page: pageNum,
        hasMore: result.next_page != null,
      };
    },
  });
}
