import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * list-updates -- List updates (comments) for an item.
 */
export function registerListUpdatesTool(app: AgentApp): void {
  app.tool('list-updates', {
    description:
      'List updates (comments) for a Monday.com item. Returns an array of { id, body, created_at, creator }. Params: item_id (required), limit? (default 25).',
    parameters: {
      type: 'object',
      properties: {
        item_id: {
          type: 'number',
          description: 'The ID of the item.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of updates to return (default 25).',
          default: 25,
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
      const limit = typeof a.limit === 'number' ? a.limit : 25;
      const query = `query { items(ids: [${a.item_id}]) { updates(limit: ${limit}) { id body created_at creator { name email } } } }`;
      const result = await mondayRequest(ctx, query);
      return result.items[0].updates;
    },
  });
}
