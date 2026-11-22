/**
 * list-products — list Shopify products with optional filtering.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerListProductsTool(app: AgentApp): void {
  app.tool('list-products', {
    description:
      'List products from your Shopify store. Supports filtering by title and collection.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of products to return (1-250, default 20).',
        },
        title: {
          type: 'string',
          description: 'Filter products by exact title.',
        },
        collectionId: {
          type: 'string',
          description: 'Filter products by collection ID.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        limit: (args.limit as number) || 20,
      };
      if (args.title) params.title = args.title;
      if (args.collectionId) params.collection_id = args.collectionId;

      return await shopifyRequest('GET', '/products.json', { params }, ctx);
    },
  });
}
