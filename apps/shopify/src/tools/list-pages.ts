/**
 * list-pages — list Shopify pages.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerListPagesTool(app: AgentApp): void {
  app.tool('list-pages', {
    description:
      'List pages from your Shopify store. Pages are used for static content like About Us or Contact.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of pages to return (1-250, default 20).',
        },
        publishedStatus: {
          type: 'string',
          enum: ['published', 'unpublished', 'any'],
          description: 'Filter by published status (default: any).',
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
      const params: Record<string, unknown> = {
        limit: (args.limit as number) || 20,
      };
      if (args.publishedStatus) params.published_status = args.publishedStatus;

      return await shopifyRequest('GET', '/pages.json', { params }, ctx);
    },
  });
}
