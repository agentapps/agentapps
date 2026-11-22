/**
 * get_product — retrieve a single Holded product by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerGetProductTool(app: AgentApp): void {
  app.tool('get_product', {
    description: 'Get detailed information about a specific Holded product.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The Holded product ID.',
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
      return await holdedRequest('GET', `invoicing/v1/products/${productId}`, null, ctx);
    },
  });
}
