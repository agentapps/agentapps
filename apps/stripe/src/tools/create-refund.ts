/**
 * create_refund — create a Stripe refund.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerCreateRefundTool(app: AgentApp): void {
  app.tool('create_refund', {
    description: 'Create a refund in Stripe. Provide either a charge ID or a payment intent ID.',
    parameters: {
      type: 'object',
      properties: {
        charge: {
          type: 'string',
          description: 'The charge ID to refund (e.g. ch_...). Provide this or payment_intent.',
        },
        payment_intent: {
          type: 'string',
          description: 'The payment intent ID to refund (e.g. pi_...). Provide this or charge.',
        },
        amount: {
          type: 'number',
          description:
            'Amount to refund in the smallest currency unit (e.g. cents). If omitted, the entire charge is refunded.',
        },
        reason: {
          type: 'string',
          enum: ['duplicate', 'fraudulent', 'requested_by_customer'],
          description: 'Reason for the refund.',
        },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {};
      if (args.charge) params.charge = args.charge;
      if (args.payment_intent) params.payment_intent = args.payment_intent;
      if (args.amount) params.amount = args.amount;
      if (args.reason) params.reason = args.reason;

      return await stripeRequest('POST', '/refunds', params, ctx);
    },
  });
}
