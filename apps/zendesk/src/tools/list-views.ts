import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * list-views — GET /views.json.
 */
export function registerListViewsTool(app: AgentApp): void {
  app.tool('list-views', {
    description:
      'List Zendesk views (ticket filters). Returns curated rows { id, title, active, position, createdAt }.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const result = await zendeskRequest<any>(ctx, '/views.json');

      const views = (result.views ?? []).map((v: any) => ({
        id: v.id,
        title: v.title,
        active: v.active,
        position: v.position,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
        url: v.url,
      }));

      return {
        views,
        total: views.length,
      };
    },
  });
}
