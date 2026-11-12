/**
 * list_products — list Holded products.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerListProductsTool(app: AgentApp): void {
  app.tool('list_products', {
    description: 'List products from your Holded account. Returns all products and services.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number for pagination (default 1).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      let path = 'invoicing/v1/products';
      if (args.page) {
        path += `?page=${args.page}`;
      }
      return await holdedRequest('GET', path, null, ctx);
    },
  });
}
