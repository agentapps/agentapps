/**
 * list_customers — list Stripe customers with optional filtering.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerListCustomersTool(app: AgentApp): void {
  app.tool('list_customers', {
    description:
      'List customers from your Stripe account. Supports filtering by email and cursor-based pagination.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of customers to return (1-100, default 10).',
        },
        email: {
          type: 'string',
          description: 'Filter customers by exact email address.',
        },
        starting_after: {
          type: 'string',
          description:
            'Cursor for pagination — the ID of the last customer from the previous page.',
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
      if (args.email) params.email = args.email;
      if (args.starting_after) params.starting_after = args.starting_after;

      return await stripeRequest('GET', '/customers', params, ctx);
    },
  });
}
