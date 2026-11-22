/**
 * get-shop — retrieve Shopify shop information.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerGetShopTool(app: AgentApp): void {
  app.tool('get-shop', {
    description:
      'Get information about the connected Shopify store, including name, domain, plan, and settings.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      return await shopifyRequest('GET', '/shop.json', null, ctx);
    },
  });
}
