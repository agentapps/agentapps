import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { clampInt, shapeAudience } from './_helpers.js';

interface ListAudiencesResponse {
  lists?: unknown[];
  total_items?: number;
}

/**
 * list-audiences — GET /lists.
 */
export function registerListAudiencesTool(app: AgentApp): void {
  app.tool('list-audiences', {
    description:
      'List audiences (lists) from Mailchimp (GET /lists). Returns { audiences, total_items, count }. Params: count? (1-1000, default 10).',
    parameters: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Max audiences to return (1-1000, default 10).',
          default: 10,
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const count = clampInt(a.count, 1, 1000, 10);

      const res = await mailchimpRequest<ListAudiencesResponse>(ctx, '/lists', {
        query: { count },
      });

      const audiences = (res.lists ?? []).map(shapeAudience);
      return {
        audiences,
        total_items: typeof res.total_items === 'number' ? res.total_items : audiences.length,
        count,
      };
    },
  });
}
