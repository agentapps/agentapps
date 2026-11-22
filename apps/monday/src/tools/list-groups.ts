import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * list-groups -- List all groups in a board.
 */
export function registerListGroupsTool(app: AgentApp): void {
  app.tool('list-groups', {
    description:
      'List all groups in a Monday.com board. Returns an array of { id, title, color, position }. Params: board_id (required).',
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
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const query = `query { boards(ids: [${a.board_id}]) { groups { id title color position } } }`;
      const result = await mondayRequest(ctx, query);
      return result.boards[0].groups;
    },
  });
}
