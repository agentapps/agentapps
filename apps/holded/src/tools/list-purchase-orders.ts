/**
 * list-purchase-orders — list Holded purchase orders.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerListPurchaseOrdersTool(app: AgentApp): void {
  app.tool('list-purchase-orders', {
    description:
      'List purchase orders from your Holded account. Returns all purchase order documents.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number for pagination (default 1).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      let path = 'invoicing/v1/documents/purchaseorder';
      if (args.page) {
        path += `?page=${args.page}`;
      }
      return await holdedRequest('GET', path, null, ctx);
    },
  });
}
