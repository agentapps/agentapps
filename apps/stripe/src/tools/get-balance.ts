/**
 * get_balance — retrieve the current Stripe account balance.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerGetBalanceTool(app: AgentApp): void {
  app.tool('get_balance', {
    description:
      'Get the current balance of your Stripe account, including available and pending amounts by currency.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: true },
    handler: async (_args, ctx) => {
      return await stripeRequest('GET', '/balance', null, ctx);
    },
  });
}
