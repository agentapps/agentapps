import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * list-columns -- List all columns in a board.
 */
export function registerListColumnsTool(app: AgentApp): void {
  app.tool('list-columns', {
    description:
      'List all columns in a Monday.com board. Returns an array of { id, title, type, description, settings_str }. Params: board_id (required).',
    parameters: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board.',
        },
      },
      required: ['board_id'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const query = `query { boards(ids: [${a.board_id}]) { columns { id title type description settings_str } } }`;
      const result = await mondayRequest(ctx, query);
      return result.boards[0].columns;
    },
  });
}
