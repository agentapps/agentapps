import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * add-update -- Add an update (comment) to an item.
 */
export function registerAddUpdateTool(app: AgentApp): void {
  app.tool('add-update', {
    description:
      'Add an update (comment) to a Monday.com item. Returns { id, body, created_at }. Params: item_id (required), body (required, supports HTML).',
    parameters: {
      type: 'object',
      properties: {
        item_id: {
          type: 'number',
          description: 'The ID of the item.',
        },
        body: {
          type: 'string',
          description: 'The update/comment text (supports HTML).',
        },
      },
      required: ['item_id', 'body'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const body = (a.body as string).replace(/"/g, '\\"');
      const query = `mutation { create_update(item_id: ${a.item_id}, body: "${body}") { id body created_at } }`;
      const result = await mondayRequest(ctx, query, undefined, false);
      return result.create_update;
    },
  });
}
