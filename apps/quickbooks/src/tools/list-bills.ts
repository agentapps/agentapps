/**
 * list_bills — list QuickBooks Online bills via query.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerListBillsTool(app: AgentApp): void {
  app.tool('list_bills', {
    description: 'List bills from your QuickBooks Online account. Returns up to maxResults bills.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of bills to return (1-1000, default 100).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const maxResults = (args.maxResults as number) || 100;
      return await quickbooksRequest(
        'GET',
        `query?query=SELECT * FROM Bill MAXRESULTS ${maxResults}`,
        null,
        ctx,
      );
    },
  });
}
