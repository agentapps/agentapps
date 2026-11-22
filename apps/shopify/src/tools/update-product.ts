/**
 * update-product — update an existing Shopify product.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerUpdateProductTool(app: AgentApp): void {
  app.tool('update-product', {
    description:
      'Update an existing product in your Shopify store. Supports updating title, description, vendor, type, and tags.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The Shopify product ID to update.',
        },
        title: {
          type: 'string',
          description: 'The new product title.',
        },
        body_html: {
          type: 'string',
          description: 'The new product description in HTML.',
        },
        vendor: {
          type: 'string',
          description: 'The new product vendor.',
        },
        product_type: {
          type: 'string',
          description: 'The new product type.',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated list of tags.',
        },
      },
      required: ['productId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const productId = args.productId as string;
      const product: Record<string, unknown> = {};
      if (args.title !== undefined) product.title = args.title;
      if (args.body_html !== undefined) product.body_html = args.body_html;
      if (args.vendor !== undefined) product.vendor = args.vendor;
      if (args.product_type !== undefined) product.product_type = args.product_type;
      if (args.tags !== undefined) product.tags = args.tags;

      return await shopifyRequest('PUT', `/products/${productId}.json`, { body: { product } }, ctx);
    },
  });
}
