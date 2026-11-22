/**
 * update-inventory-level — set the inventory level for an item at a location.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerUpdateInventoryLevelTool(app: AgentApp): void {
  app.tool('update-inventory-level', {
    description:
      'Set the available inventory quantity for an item at a specific location in your Shopify store.',
    parameters: {
      type: 'object',
      properties: {
        inventoryItemId: {
          type: 'string',
          description: 'The inventory item ID.',
        },
        locationId: {
          type: 'string',
          description: 'The location ID where inventory is stocked.',
        },
        available: {
          type: 'number',
          description: 'The available quantity to set.',
        },
      },
      required: ['inventoryItemId', 'locationId', 'available'],
    },
    // Sets a quantity; setting the previous value again undoes it.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      return await shopifyRequest(
        'POST',
        '/inventory_levels/set.json',
        {
          body: {
            inventory_item_id: Number(args.inventoryItemId),
            location_id: Number(args.locationId),
            available: args.available as number,
          },
        },
        ctx,
      );
    },
  });
}
