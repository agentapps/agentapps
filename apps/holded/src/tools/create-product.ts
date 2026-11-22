/**
 * create-product — create a new Holded product.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerCreateProductTool(app: AgentApp): void {
  app.tool('create-product', {
    description: 'Create a new product in Holded. Returns the created product object.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Product name.',
        },
        sku: {
          type: 'string',
          description: 'Product SKU / reference code.',
        },
        price: {
          type: 'number',
          description: 'Product price (before tax).',
        },
        description: {
          type: 'string',
          description: 'Product description.',
        },
        tax: {
          type: 'number',
          description: 'Tax percentage (e.g. 21 for 21% IVA).',
        },
        kind: {
          type: 'string',
          enum: ['product', 'service'],
          description: 'Whether this is a physical product or a service (default: product).',
        },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        name: args.name,
      };
      if (args.sku) body.sku = args.sku;
      if (args.price !== undefined) body.price = args.price;
      if (args.description) body.description = args.description;
      if (args.tax !== undefined) body.tax = args.tax;
      if (args.kind) body.kind = args.kind;

      return await holdedRequest('POST', 'invoicing/v1/products', body, ctx);
    },
  });
}
