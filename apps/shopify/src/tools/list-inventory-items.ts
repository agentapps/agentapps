/**
 * list-inventory-items — retrieve Shopify inventory items by IDs.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerListInventoryItemsTool(app: AgentApp): void {
  app.tool('list-inventory-items', {
    description:
      'Retrieve inventory items from your Shopify store by their IDs. Returns stock and cost information.',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'string',
          description: 'Comma-separated list of inventory item IDs to retrieve.',
        },
      },
      required: ['ids'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const ids = args.ids as string;
      return await shopifyRequest('GET', '/inventory_items.json', { params: { ids } }, ctx);
    },
  });
}
