import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * search — GET /search.
 */
export function registerSearchTool(app: AgentApp): void {
  app.tool('search', {
    description:
      'Search for cards, boards, or members across all Trello boards. Params: query (required), modelTypes? (comma-separated: cards, boards, members; default "cards"), partial? (default false).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query.' },
        modelTypes: {
          type: 'string',
          description: 'Comma-separated list: cards, boards, members (default: cards).',
          default: 'cards',
        },
        partial: {
          type: 'boolean',
          description: 'Whether to match partial words (default: false).',
          default: false,
        },
      },
      required: ['query'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const query = String(a.query);
      const modelTypes = typeof a.modelTypes === 'string' ? a.modelTypes : 'cards';
      const partial = typeof a.partial === 'boolean' ? a.partial : false;

      const results = await trelloRequest(ctx, '/search', {
        query: {
          query,
          modelTypes,
          partial,
        },
      });

      return results;
    },
  });
}
