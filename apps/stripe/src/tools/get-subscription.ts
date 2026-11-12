/**
 * get_subscription — retrieve a single Stripe subscription by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerGetSubscriptionTool(app: AgentApp): void {
  app.tool('get_subscription', {
    description: 'Get detailed information about a specific Stripe subscription.',
    parameters: {
      type: 'object',
      properties: {
        subscriptionId: {
          type: 'string',
          description: 'The subscription ID (e.g. sub_...).',
        },
      },
      required: ['subscriptionId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const subscriptionId = args.subscriptionId as string;
      return await stripeRequest('GET', `/subscriptions/${subscriptionId}`, null, ctx);
    },
  });
}
