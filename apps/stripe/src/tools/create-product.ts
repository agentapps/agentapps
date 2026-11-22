/**
 * create-product — create a new Stripe product.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerCreateProductTool(app: AgentApp): void {
  app.tool('create-product', {
    description: 'Create a new product in Stripe. Returns the created product object.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: "The product's name.",
        },
        description: {
          type: 'string',
          description: "The product's description.",
        },
        metadata: {
          type: 'object',
          description: 'Key-value pairs of metadata to attach to the product.',
          additionalProperties: { type: 'string' },
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
      const params: Record<string, unknown> = {
        name: args.name,
      };
      if (args.description) params.description = args.description;
      if (args.metadata) params.metadata = args.metadata;

      return await stripeRequest('POST', '/products', params, ctx);
    },
  });
}
