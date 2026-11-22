import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * search-tickets — GET /search/tickets?query="{query}"
 *
 * Searches Freshdesk tickets using a query string. Uses Freshdesk's search API
 * which supports field-based queries (e.g. "status:2 AND priority:3").
 */
export function registerSearchTicketsTool(app: AgentApp): void {
  app.tool('search-tickets', {
    description:
      'Search Freshdesk tickets using a query string (GET /api/v2/search/tickets?query="{query}"). Supports field-based queries like "status:2 AND priority:3", "tag:\'billing\'", "created_at:>\'2024-01-01\'". Returns matching tickets with total count. Max 30 results per page.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search query string. Examples: "status:2", "priority:3 AND status:2", "tag:\'vip\'", "created_at:>\'2024-01-01\'".',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default 1).',
        },
      },
      required: ['query'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const query = args.query as string;
      const params: Record<string, unknown> = {
        query: `"${query}"`,
      };
      if (args.page !== undefined) params.page = args.page;

      const result = await freshdeskRequest<{ results: unknown[]; total: number }>(
        'GET',
        '/search/tickets',
        params,
        ctx,
      );

      return { total: result.total, tickets: result.results };
    },
  });
}
