import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * list-items -- List items (rows) in a board.
 */
export function registerListItemsTool(app: AgentApp): void {
  app.tool('list-items', {
    description:
      'List items (rows) in a Monday.com board. Returns the board with items_page and groups. Params: board_id (required), limit? (default 50), group_id? (string, filter by group).',
    parameters: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of items to return (default 50).',
          default: 50,
        },
        group_id: {
          type: 'string',
          description: 'Filter by group ID (optional).',
        },
      },
      required: ['board_id'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const limit = typeof a.limit === 'number' ? a.limit : 50;
      const groupFilter = a.group_id ? `(ids: ["${a.group_id}"])` : '';
      const query = `query { boards(ids: [${a.board_id}]) { items_page(limit: ${limit}) { items { id name group { id title } column_values { id text value } } } groups${groupFilter} { id title } } }`;
      const result = await mondayRequest(ctx, query);
      return result.boards[0];
    },
  });
}
