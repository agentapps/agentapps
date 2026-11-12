/**
 * list_customers — list Shopify customers.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerListCustomersTool(app: AgentApp): void {
  app.tool('list_customers', {
    description: 'List customers from your Shopify store.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of customers to return (1-250, default 20).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        limit: (args.limit as number) || 20,
      };

      return await shopifyRequest('GET', '/customers.json', { params }, ctx);
    },
  });
}
