/**
 * create_payment_link — create a Stripe Payment Link.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerCreatePaymentLinkTool(app: AgentApp): void {
  app.tool('create_payment_link', {
    description:
      'Create a Stripe Payment Link for accepting payments. Returns a URL that can be shared with customers.',
    parameters: {
      type: 'object',
      properties: {
        lineItems: {
          type: 'array',
          description:
            'Line items for the payment link. Each item needs a Stripe price ID and quantity.',
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
        afterCompletionMessage: {
          type: 'string',
          description: 'A custom message to display after payment completion.',
        },
        afterCompletionUrl: {
          type: 'string',
          description: 'A URL to redirect to after payment completion.',
        },
      },
      required: ['lineItems'],
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
      const lineItems = args.lineItems as Array<{ price: string; quantity: number }>;
      const params: Record<string, unknown> = {
        line_items: lineItems,
      };

      if (args.afterCompletionUrl) {
        params.after_completion = {
          type: 'redirect',
          redirect: { url: args.afterCompletionUrl as string },
        };
      } else if (args.afterCompletionMessage) {
        params.after_completion = {
          type: 'hosted_confirmation',
          hosted_confirmation: { custom_message: args.afterCompletionMessage as string },
        };
      }

      return await stripeRequest('POST', '/payment_links', params, ctx);
    },
  });
}
