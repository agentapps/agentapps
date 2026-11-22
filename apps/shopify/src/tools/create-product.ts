/**
 * create-product — create a new Shopify product.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerCreateProductTool(app: AgentApp): void {
  app.tool('create-product', {
    description: 'Create a new product in your Shopify store. Returns the created product object.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The product title.',
        },
        body_html: {
          type: 'string',
          description: 'The product description in HTML.',
        },
        vendor: {
          type: 'string',
          description: 'The product vendor.',
        },
        product_type: {
          type: 'string',
          description: 'The product type.',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated list of tags.',
        },
      },
      required: ['title'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const product: Record<string, unknown> = {
        title: args.title,
      };
      if (args.body_html) product.body_html = args.body_html;
      if (args.vendor) product.vendor = args.vendor;
      if (args.product_type) product.product_type = args.product_type;
      if (args.tags) product.tags = args.tags;

      return await shopifyRequest('POST', '/products.json', { body: { product } }, ctx);
    },
  });
}
