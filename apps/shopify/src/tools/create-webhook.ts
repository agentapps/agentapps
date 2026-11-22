/**
 * create-webhook — create a Shopify webhook subscription.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerCreateWebhookTool(app: AgentApp): void {
  app.tool('create-webhook', {
    description:
      'Create a webhook subscription in your Shopify store. Shopify will send HTTP POST requests to the specified address when the given event occurs.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description:
            'The event topic to subscribe to (e.g. orders/create, products/update, customers/delete).',
        },
        address: {
          type: 'string',
          description: 'The URL where Shopify will send webhook POST requests.',
        },
        format: {
          type: 'string',
          enum: ['json', 'xml'],
          description: 'The format of the webhook payload (default: json).',
        },
      },
      required: ['topic', 'address'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const webhook: Record<string, unknown> = {
        topic: args.topic,
        address: args.address,
        format: (args.format as string) || 'json',
      };

      return await shopifyRequest('POST', '/webhooks.json', { body: { webhook } }, ctx);
    },
  });
}
