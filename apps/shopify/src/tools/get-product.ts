/**
 * get_product — retrieve a single Shopify product by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerGetProductTool(app: AgentApp): void {
  app.tool('get_product', {
    description: 'Get detailed information about a specific Shopify product by its ID.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The Shopify product ID.',
        },
      },
      required: ['productId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const productId = args.productId as string;
      return await shopifyRequest('GET', `/products/${productId}.json`, null, ctx);
    },
  });
}
