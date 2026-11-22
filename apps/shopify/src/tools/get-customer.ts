/**
 * get-customer — retrieve a single Shopify customer by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerGetCustomerTool(app: AgentApp): void {
  app.tool('get-customer', {
    description: 'Get detailed information about a specific Shopify customer by their ID.',
    parameters: {
      type: 'object',
      properties: {
        customerId: {
          type: 'string',
          description: 'The Shopify customer ID.',
        },
      },
      required: ['customerId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const customerId = args.customerId as string;
      return await shopifyRequest('GET', `/customers/${customerId}.json`, null, ctx);
    },
  });
}
