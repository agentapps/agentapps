/**
 * update-product — update an existing Holded product.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerUpdateProductTool(app: AgentApp): void {
  app.tool('update-product', {
    description: 'Update an existing product in Holded. Only provided fields are changed.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The Holded product ID to update.',
        },
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
          description: 'Whether this is a physical product or a service.',
        },
      },
      required: ['productId'],
    },
    // Setting the fields again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const productId = args.productId as string;
      const body: Record<string, unknown> = {};
      if (args.name) body.name = args.name;
      if (args.sku) body.sku = args.sku;
      if (args.price !== undefined) body.price = args.price;
      if (args.description) body.description = args.description;
      if (args.tax !== undefined) body.tax = args.tax;
      if (args.kind) body.kind = args.kind;

      return await holdedRequest('PUT', `invoicing/v1/products/${productId}`, body, ctx);
    },
  });
}
