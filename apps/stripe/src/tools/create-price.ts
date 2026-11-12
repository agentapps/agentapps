/**
 * create_price — create a new Stripe price.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerCreatePriceTool(app: AgentApp): void {
  app.tool('create_price', {
    description:
      'Create a new price in Stripe for an existing product. Supports one-time and recurring pricing.',
    parameters: {
      type: 'object',
      properties: {
        unit_amount: {
          type: 'number',
          description: 'Price amount in the smallest currency unit (e.g. cents). 1000 = $10.00.',
        },
        currency: {
          type: 'string',
          description: 'Three-letter ISO currency code (e.g. "usd", "eur").',
        },
        product: {
          type: 'string',
          description: 'The product ID this price belongs to (e.g. prod_...).',
        },
        recurring: {
          type: 'object',
          description: 'Recurring billing configuration. Omit for one-time prices.',
          properties: {
            interval: {
              type: 'string',
              enum: ['day', 'week', 'month', 'year'],
              description: 'Billing interval.',
            },
            interval_count: {
              type: 'number',
              description: 'Number of intervals between billings (default 1).',
            },
          },
          required: ['interval'],
        },
      },
      required: ['unit_amount', 'currency', 'product'],
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        unit_amount: args.unit_amount,
        currency: args.currency,
        product: args.product,
      };
      if (args.recurring) params.recurring = args.recurring;

      return await stripeRequest('POST', '/prices', params, ctx);
    },
  });
}
