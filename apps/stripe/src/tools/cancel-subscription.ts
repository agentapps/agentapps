/**
 * cancel_subscription — cancel a Stripe subscription.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerCancelSubscriptionTool(app: AgentApp): void {
  app.tool('cancel_subscription', {
    description:
      'Cancel a Stripe subscription. By default cancels at the end of the current billing period.',
    parameters: {
      type: 'object',
      properties: {
        subscriptionId: {
          type: 'string',
          description: 'The subscription ID to cancel (e.g. sub_...).',
        },
        cancelAtPeriodEnd: {
          type: 'boolean',
          description:
            'If true (default), the subscription is canceled at the end of the current period. If false, it is canceled immediately.',
        },
      },
      required: ['subscriptionId'],
    },
    annotations: {
      readOnlyHint: false,
      // With cancelAtPeriodEnd false the subscription ends at once and cannot be reactivated.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const subscriptionId = args.subscriptionId as string;
      const cancelAtPeriodEnd = args.cancelAtPeriodEnd !== false;

      if (cancelAtPeriodEnd) {
        // Update the subscription to cancel at period end
        return await stripeRequest(
          'POST',
          `/subscriptions/${subscriptionId}`,
          { cancel_at_period_end: true },
          ctx,
        );
      }

      // Immediately cancel
      return await stripeRequest('DELETE', `/subscriptions/${subscriptionId}`, null, ctx);
    },
  });
}
