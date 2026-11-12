import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * list-automations — GET /automations.json.
 */
export function registerListAutomationsTool(app: AgentApp): void {
  app.tool('list-automations', {
    description:
      'List Zendesk automations (time-based business rules). Read-only for agents. Returns curated rows { id, title, active, position, createdAt }.',
    parameters: {
      type: 'object',
      properties: {
        active: {
          type: 'boolean',
          description: 'Filter by active status.',
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
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { active, limit, page } = (args ?? {}) as {
        active?: boolean;
        limit?: number;
        page?: number;
      };

      const query: Record<string, string | number | undefined> = {
        per_page: Math.min(limit ?? 30, 100),
        page: page ?? 1,
      };
      if (active !== undefined) query.active = String(active);

      const result = await zendeskRequest<any>(ctx, '/automations.json', { query });

      const automations = (result.automations ?? []).map((a: any) => ({
        id: a.id,
        title: a.title,
        active: a.active,
        position: a.position,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
        url: a.url,
      }));

      return {
        automations,
        total: automations.length,
        page: page ?? 1,
        hasMore: result.next_page != null,
      };
    },
  });
}
