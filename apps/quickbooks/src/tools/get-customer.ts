/**
 * get_customer — retrieve a single QuickBooks Online customer by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerGetCustomerTool(app: AgentApp): void {
  app.tool('get_customer', {
    description: 'Get detailed information about a specific QuickBooks customer.',
    parameters: {
      type: 'object',
      properties: {
        customerId: {
          type: 'string',
          description: 'The QuickBooks customer ID.',
        },
      },
      required: ['customerId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const customerId = args.customerId as string;
      return await quickbooksRequest('GET', `customer/${customerId}`, null, ctx);
    },
  });
}
