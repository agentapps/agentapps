import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * update-item -- Update column values of an item.
 */
export function registerUpdateItemTool(app: AgentApp): void {
  app.tool('update-item', {
    description:
      'Update column values of a Monday.com item. Returns { id, name }. Params: board_id (required), item_id (required), column_values (required, object with column IDs as keys).',
    parameters: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board.',
        },
        item_id: {
          type: 'number',
          description: 'The ID of the item.',
        },
        column_values: {
          type: 'object',
          description: 'Column values to update as JSON object. Keys are column IDs.',
        },
      },
      required: ['board_id', 'item_id', 'column_values'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const columnValues = JSON.stringify(JSON.stringify(a.column_values));
      const query = `mutation { change_multiple_column_values(board_id: ${a.board_id}, item_id: ${a.item_id}, column_values: ${columnValues}) { id name } }`;
      const result = await mondayRequest(ctx, query, undefined, false);
      return result.change_multiple_column_values;
    },
  });
}
