import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * delete-item -- Delete an item. IRREVERSIBLE.
 */
export function registerDeleteItemTool(app: AgentApp): void {
  app.tool('delete-item', {
    description:
      'Delete a Monday.com item permanently. IRREVERSIBLE. Returns { id, deleted }. Params: item_id (required).',
    parameters: {
      type: 'object',
      properties: {
        item_id: {
          type: 'number',
          description: 'The ID of the item to delete.',
        },
      },
      required: ['item_id'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const query = `mutation { delete_item(item_id: ${a.item_id}) { id } }`;
      const result = await mondayRequest(ctx, query, undefined, false);
      return { id: result.delete_item.id, deleted: true };
    },
  });
}
