/**
 * list_orders — list Shopify orders with optional filtering.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerListOrdersTool(app: AgentApp): void {
  app.tool('list_orders', {
    description:
      'List orders from your Shopify store. Supports filtering by status, financial status, and fulfillment status.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of orders to return (1-250, default 20).',
        },
        status: {
          type: 'string',
          enum: ['open', 'closed', 'cancelled', 'any'],
          description: 'Filter by order status (default: open).',
        },
        financialStatus: {
          type: 'string',
          description: 'Filter by financial status (e.g. paid, pending, refunded).',
        },
        fulfillmentStatus: {
          type: 'string',
          description: 'Filter by fulfillment status (e.g. fulfilled, unfulfilled, partial).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        limit: (args.limit as number) || 20,
      };
      if (args.status) params.status = args.status;
      if (args.financialStatus) params.financial_status = args.financialStatus;
      if (args.fulfillmentStatus) params.fulfillment_status = args.fulfillmentStatus;

      return await shopifyRequest('GET', '/orders.json', { params }, ctx);
    },
  });
}
