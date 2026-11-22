/**
 * get_payment — retrieve a single Stripe payment intent by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerGetPaymentTool(app: AgentApp): void {
  app.tool('get_payment', {
    description: 'Get detailed information about a specific Stripe payment intent.',
    parameters: {
      type: 'object',
      properties: {
        paymentIntentId: {
          type: 'string',
          description: 'The payment intent ID (e.g. pi_...).',
        },
      },
      required: ['paymentIntentId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const paymentIntentId = args.paymentIntentId as string;
      return await stripeRequest('GET', `/payment_intents/${paymentIntentId}`, null, ctx);
    },
  });
}
