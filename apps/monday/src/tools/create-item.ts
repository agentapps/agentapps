import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * create-item -- Create a new item (row) in a board.
 */
export function registerCreateItemTool(app: AgentApp): void {
  app.tool('create-item', {
    description:
      'Create a new item (row) in a Monday.com board. Returns { id, name }. Params: board_id (required), item_name (required), group_id? (string), column_values? (object, keys are column IDs).',
    parameters: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board.',
        },
        item_name: {
          type: 'string',
          description: 'Name of the item.',
        },
        group_id: {
          type: 'string',
          description:
            'Group ID to create the item in (optional, uses first group if not specified).',
        },
        column_values: {
          type: 'object',
          description:
            'Column values as JSON object (optional). Keys are column IDs, values are the data.',
        },
      },
      required: ['board_id', 'item_name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const groupArg = a.group_id ? `, group_id: "${a.group_id}"` : '';
      const columnValues = a.column_values
        ? `, column_values: ${JSON.stringify(JSON.stringify(a.column_values))}`
        : '';
      const query = `mutation { create_item(board_id: ${a.board_id}, item_name: "${a.item_name}"${groupArg}${columnValues}) { id name } }`;
      const result = await mondayRequest(ctx, query, undefined, false);
      return result.create_item;
    },
  });
}
