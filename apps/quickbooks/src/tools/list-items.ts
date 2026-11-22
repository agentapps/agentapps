/**
 * list_items — list QuickBooks Online items (products/services) via query.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerListItemsTool(app: AgentApp): void {
  app.tool('list_items', {
    description:
      'List items (products and services) from your QuickBooks Online account. Returns up to maxResults items.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of items to return (1-1000, default 100).',
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
      const maxResults = (args.maxResults as number) || 100;
      return await quickbooksRequest(
        'GET',
        `query?query=SELECT * FROM Item MAXRESULTS ${maxResults}`,
        null,
        ctx,
      );
    },
  });
}
