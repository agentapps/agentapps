import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * search-items -- Search for items across boards.
 */
export function registerSearchItemsTool(app: AgentApp): void {
  app.tool('search-items', {
    description:
      'Search for items across Monday.com boards by name. Returns an array of matching items with { id, name, board: { id, name } }. Params: query (required), limit? (default 25).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of items to return (default 25).',
          default: 25,
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
      const a = args as Record<string, unknown>;
      const limit = typeof a.limit === 'number' ? a.limit : 25;
      const searchQuery = `query { boards(limit: 50) { id name items_page(limit: 100) { items { id name } } } }`;
      const result = await mondayRequest(ctx, searchQuery);
      const searchTerm = (a.query as string).toLowerCase();
      const matchingItems = result.boards.flatMap((b: any) =>
        (b.items_page?.items || [])
          .filter((i: any) => i.name.toLowerCase().includes(searchTerm))
          .map((i: any) => ({ ...i, board: { id: b.id, name: b.name } })),
      );
      return matchingItems.slice(0, limit);
    },
  });
}
