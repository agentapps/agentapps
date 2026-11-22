import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * get-item -- Get details of a specific item including all column values.
 */
export function registerGetItemTool(app: AgentApp): void {
  app.tool('get-item', {
    description:
      'Get details of a specific Monday.com item including all column values and updates. Returns { id, name, board, group, column_values, updates }. Params: item_id (required).',
    parameters: {
      type: 'object',
      properties: {
        item_id: {
          type: 'number',
          description: 'The ID of the item.',
        },
      },
      required: ['item_id'],
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
      const query = `query { items(ids: [${a.item_id}]) { id name board { id name } group { id title } column_values { id title text value type } updates { id body created_at creator { name } } } }`;
      const result = await mondayRequest(ctx, query);
      return result.items[0];
    },
  });
}
