/**
 * list_webhooks — list Shopify webhooks.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerListWebhooksTool(app: AgentApp): void {
  app.tool('list_webhooks', {
    description: 'List webhook subscriptions configured in your Shopify store.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of webhooks to return (1-250, default 20).',
        },
        topic: {
          type: 'string',
          description: 'Filter by webhook topic (e.g. orders/create, products/update).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        limit: (args.limit as number) || 20,
      };
      if (args.topic) params.topic = args.topic;

      return await shopifyRequest('GET', '/webhooks.json', { params }, ctx);
    },
  });
}
