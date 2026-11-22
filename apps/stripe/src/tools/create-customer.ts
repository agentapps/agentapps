/**
 * create_customer — create a new Stripe customer.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerCreateCustomerTool(app: AgentApp): void {
  app.tool('create_customer', {
    description: 'Create a new customer in Stripe. Returns the created customer object.',
    parameters: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: "The customer's email address.",
        },
        name: {
          type: 'string',
          description: "The customer's full name.",
        },
        phone: {
          type: 'string',
          description: "The customer's phone number.",
        },
        description: {
          type: 'string',
          description: 'An arbitrary description for the customer.',
        },
        metadata: {
          type: 'object',
          description: 'Key-value pairs of metadata to attach to the customer.',
          additionalProperties: { type: 'string' },
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {};
      if (args.email) params.email = args.email;
      if (args.name) params.name = args.name;
      if (args.phone) params.phone = args.phone;
      if (args.description) params.description = args.description;
      if (args.metadata) params.metadata = args.metadata;

      return await stripeRequest('POST', '/customers', params, ctx);
    },
  });
}
