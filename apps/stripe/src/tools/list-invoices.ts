/**
 * list-invoices — list Stripe invoices.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerListInvoicesTool(app: AgentApp): void {
  app.tool('list-invoices', {
    description:
      'List invoices from your Stripe account. Supports filtering by customer and status.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of invoices to return (1-100, default 10).',
        },
        customer: {
          type: 'string',
          description: 'Filter by customer ID.',
        },
        status: {
          type: 'string',
          enum: ['draft', 'open', 'paid', 'uncollectible', 'void'],
          description: 'Filter by invoice status.',
        },
        starting_after: {
          type: 'string',
          description: 'Cursor for pagination — the ID of the last invoice from the previous page.',
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
      if (args.status) params.status = args.status;
      if (args.starting_after) params.starting_after = args.starting_after;

      return await stripeRequest('GET', '/invoices', params, ctx);
    },
  });
}
