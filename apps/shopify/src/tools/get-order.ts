/**
 * get-order — retrieve a single Shopify order by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerGetOrderTool(app: AgentApp): void {
  app.tool('get-order', {
    description: 'Get detailed information about a specific Shopify order by its ID.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'The Shopify order ID.',
        },
      },
      required: ['orderId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const orderId = args.orderId as string;
      return await shopifyRequest('GET', `/orders/${orderId}.json`, null, ctx);
    },
  });
}
