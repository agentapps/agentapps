/**
 * list_collections — list Shopify custom and smart collections.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerListCollectionsTool(app: AgentApp): void {
  app.tool('list_collections', {
    description:
      'List collections from your Shopify store. Returns both custom collections and smart collections.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of collections to return per type (1-250, default 20).',
        },
        type: {
          type: 'string',
          enum: ['custom', 'smart', 'all'],
          description: 'Type of collections to return (default: all).',
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
      const limit = (args.limit as number) || 20;
      const collectionType = (args.type as string) || 'all';
      const params: Record<string, unknown> = { limit };

      if (collectionType === 'custom') {
        return await shopifyRequest('GET', '/custom_collections.json', { params }, ctx);
      }

      if (collectionType === 'smart') {
        return await shopifyRequest('GET', '/smart_collections.json', { params }, ctx);
      }

      // Fetch both types
      const [custom, smart] = await Promise.all([
        shopifyRequest('GET', '/custom_collections.json', { params }, ctx) as Promise<
          Record<string, unknown>
        >,
        shopifyRequest('GET', '/smart_collections.json', { params }, ctx) as Promise<
          Record<string, unknown>
        >,
      ]);

      return {
        custom_collections: (custom as Record<string, unknown>).custom_collections ?? [],
        smart_collections: (smart as Record<string, unknown>).smart_collections ?? [],
      };
    },
  });
}
