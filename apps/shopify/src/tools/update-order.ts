/**
 * update_order — update an existing Shopify order.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerUpdateOrderTool(app: AgentApp): void {
  app.tool('update_order', {
    description:
      'Update an existing order in your Shopify store. Supports updating note, tags, and email.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'The Shopify order ID to update.',
        },
        note: {
          type: 'string',
          description: 'A note to attach to the order.',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated list of tags for the order.',
        },
        email: {
          type: 'string',
          description: 'The email address associated with the order.',
        },
      },
      required: ['orderId'],
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
    handler: async (args, ctx) => {
      const orderId = args.orderId as string;
      const order: Record<string, unknown> = {};
      if (args.note !== undefined) order.note = args.note;
      if (args.tags !== undefined) order.tags = args.tags;
      if (args.email !== undefined) order.email = args.email;

      return await shopifyRequest('PUT', `/orders/${orderId}.json`, { body: { order } }, ctx);
    },
  });
}
