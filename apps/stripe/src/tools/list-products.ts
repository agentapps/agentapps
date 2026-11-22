/**
 * list_products — list Stripe products.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerListProductsTool(app: AgentApp): void {
  app.tool('list_products', {
    description:
      'List products from your Stripe account. Supports filtering by active status and pagination.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of products to return (1-100, default 10).',
        },
        active: {
          type: 'boolean',
          description: 'Filter by active status. If omitted, returns all products.',
        },
        starting_after: {
          type: 'string',
          description: 'Cursor for pagination — the ID of the last product from the previous page.',
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
        limit: (args.limit as number) || 10,
      };
      if (args.active !== undefined) params.active = args.active;
      if (args.starting_after) params.starting_after = args.starting_after;

      return await stripeRequest('GET', '/products', params, ctx);
    },
  });
}
