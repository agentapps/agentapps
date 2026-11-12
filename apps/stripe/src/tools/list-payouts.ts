/**
 * list_payouts — list Stripe payouts.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerListPayoutsTool(app: AgentApp): void {
  app.tool('list_payouts', {
    description:
      'List payouts from your Stripe account. Supports filtering by status and pagination.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of payouts to return (1-100, default 10).',
        },
        status: {
          type: 'string',
          enum: ['pending', 'paid', 'failed', 'canceled', 'in_transit'],
          description: 'Filter by payout status.',
        },
        starting_after: {
          type: 'string',
          description: 'Cursor for pagination — the ID of the last payout from the previous page.',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        limit: (args.limit as number) || 10,
      };
      if (args.status) params.status = args.status;
      if (args.starting_after) params.starting_after = args.starting_after;

      return await stripeRequest('GET', '/payouts', params, ctx);
    },
  });
}
