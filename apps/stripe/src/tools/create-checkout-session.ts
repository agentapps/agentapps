/**
 * create_checkout_session — create a Stripe Checkout session.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerCreateCheckoutSessionTool(app: AgentApp): void {
  app.tool('create_checkout_session', {
    description:
      'Create a Stripe Checkout session. Returns a URL where the customer can complete payment.',
    parameters: {
      type: 'object',
      properties: {
        success_url: {
          type: 'string',
          description: 'URL to redirect to after successful payment.',
        },
        cancel_url: {
          type: 'string',
          description: 'URL to redirect to if the customer cancels.',
        },
        line_items: {
          type: 'array',
          description: 'Line items for the checkout session.',
          items: {
            type: 'object',
            properties: {
              price: {
                type: 'string',
                description: 'The Stripe price ID (e.g. price_...).',
              },
              quantity: {
                type: 'number',
                description: 'The quantity of the item.',
              },
            },
            required: ['price', 'quantity'],
          },
        },
        mode: {
          type: 'string',
          enum: ['payment', 'setup', 'subscription'],
          description: 'The mode of the Checkout session (default "payment").',
        },
        customer: {
          type: 'string',
          description: 'Existing customer ID to associate with this session.',
        },
      },
      required: ['success_url', 'line_items', 'mode'],
    },
    annotations: {
      readOnlyHint: false,
      // Creates a payment page; no money moves until a customer pays on it.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        success_url: args.success_url,
        line_items: args.line_items,
        mode: args.mode,
      };
      if (args.cancel_url) params.cancel_url = args.cancel_url;
      if (args.customer) params.customer = args.customer;

      return await stripeRequest('POST', '/checkout/sessions', params, ctx);
    },
  });
}
