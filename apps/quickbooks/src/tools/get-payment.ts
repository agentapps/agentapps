/**
 * get_payment — retrieve a single QuickBooks Online payment by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerGetPaymentTool(app: AgentApp): void {
  app.tool('get_payment', {
    description: 'Get detailed information about a specific QuickBooks payment.',
    parameters: {
      type: 'object',
      properties: {
        paymentId: {
          type: 'string',
          description: 'The QuickBooks payment ID.',
        },
      },
      required: ['paymentId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const paymentId = args.paymentId as string;
      return await quickbooksRequest('GET', `payment/${paymentId}`, null, ctx);
    },
  });
}
