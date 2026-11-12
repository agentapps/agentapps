/**
 * get_customer — retrieve a single Stripe customer by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerGetCustomerTool(app: AgentApp): void {
  app.tool('get_customer', {
    description: 'Get detailed information about a specific Stripe customer by their ID.',
    parameters: {
      type: 'object',
      properties: {
        customerId: {
          type: 'string',
          description: 'The Stripe customer ID (e.g. cus_...).',
        },
      },
      required: ['customerId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const customerId = args.customerId as string;
      return await stripeRequest('GET', `/customers/${customerId}`, null, ctx);
    },
  });
}
