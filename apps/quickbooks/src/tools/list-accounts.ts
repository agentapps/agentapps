/**
 * list_accounts — list QuickBooks Online accounts (chart of accounts) via query.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerListAccountsTool(app: AgentApp): void {
  app.tool('list_accounts', {
    description:
      'List accounts (chart of accounts) from your QuickBooks Online account. Returns up to maxResults accounts.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of accounts to return (1-1000, default 100).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const maxResults = (args.maxResults as number) || 100;
      return await quickbooksRequest(
        'GET',
        `query?query=SELECT * FROM Account MAXRESULTS ${maxResults}`,
        null,
        ctx,
      );
    },
  });
}
