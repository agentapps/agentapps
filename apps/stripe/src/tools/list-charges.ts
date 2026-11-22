/**
 * list_charges — list Stripe charges.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerListChargesTool(app: AgentApp): void {
  app.tool('list_charges', {
    description:
      'List charges from your Stripe account. Supports filtering by customer and payment intent.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of charges to return (1-100, default 10).',
        },
        customer: {
          type: 'string',
          description: 'Filter by customer ID.',
        },
        payment_intent: {
          type: 'string',
          description: 'Filter by payment intent ID.',
        },
        starting_after: {
          type: 'string',
          description: 'Cursor for pagination — the ID of the last charge from the previous page.',
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
      if (args.customer) params.customer = args.customer;
      if (args.payment_intent) params.payment_intent = args.payment_intent;
      if (args.starting_after) params.starting_after = args.starting_after;

      return await stripeRequest('GET', '/charges', params, ctx);
    },
  });
}
