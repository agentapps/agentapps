/**
 * list-prices — list Stripe prices.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerListPricesTool(app: AgentApp): void {
  app.tool('list-prices', {
    description:
      'List prices from your Stripe account. Supports filtering by product and active status.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of prices to return (1-100, default 10).',
        },
        product: {
          type: 'string',
          description: 'Filter by product ID.',
        },
        active: {
          type: 'boolean',
          description: 'Filter by active status. If omitted, returns all prices.',
        },
        starting_after: {
          type: 'string',
          description: 'Cursor for pagination — the ID of the last price from the previous page.',
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
      if (args.product) params.product = args.product;
      if (args.active !== undefined) params.active = args.active;
      if (args.starting_after) params.starting_after = args.starting_after;

      return await stripeRequest('GET', '/prices', params, ctx);
    },
  });
}
