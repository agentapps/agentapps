import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * list-groups — GET /groups.json.
 */
export function registerListGroupsTool(app: AgentApp): void {
  app.tool('list-groups', {
    description:
      'List Zendesk groups (ticket assignment groups). Returns curated rows { id, name, default, createdAt }.',
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
      const result = await zendeskRequest<any>(ctx, '/groups.json');

      const groups = (result.groups ?? []).map((g: any) => ({
        id: g.id,
        name: g.name,
        default: g.default,
        createdAt: g.created_at,
        updatedAt: g.updated_at,
        url: g.url,
      }));

      return {
        groups,
        total: groups.length,
      };
    },
  });
}
