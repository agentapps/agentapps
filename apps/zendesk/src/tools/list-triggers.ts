import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * list-triggers — GET /triggers.json.
 */
export function registerListTriggersTool(app: AgentApp): void {
  app.tool('list-triggers', {
    description:
      'List Zendesk triggers (business rules that fire on ticket events). Read-only for agents. Returns curated rows { id, title, active, position, createdAt }.',
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
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
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

      const result = await zendeskRequest<any>(ctx, '/triggers.json', { query });

      const triggers = (result.triggers ?? []).map((t: any) => ({
        id: t.id,
        title: t.title,
        active: t.active,
        position: t.position,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        url: t.url,
      }));

      return {
        triggers,
        total: triggers.length,
        page: page ?? 1,
        hasMore: result.next_page != null,
      };
    },
  });
}
