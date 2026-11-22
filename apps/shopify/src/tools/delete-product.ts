/**
 * delete-product — delete a Shopify product by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerDeleteProductTool(app: AgentApp): void {
  app.tool('delete-product', {
    description: 'Delete a product from your Shopify store by its ID. This action is irreversible.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The Shopify product ID to delete.',
        },
      },
      required: ['productId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const productId = args.productId as string;
      return await shopifyRequest('DELETE', `/products/${productId}.json`, null, ctx);
    },
  });
}
