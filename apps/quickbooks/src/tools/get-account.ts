/**
 * get_account — retrieve a single QuickBooks Online account by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerGetAccountTool(app: AgentApp): void {
  app.tool('get_account', {
    description:
      'Get detailed information about a specific QuickBooks account from the chart of accounts.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'The QuickBooks account ID.',
        },
      },
      required: ['accountId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const accountId = args.accountId as string;
      return await quickbooksRequest('GET', `account/${accountId}`, null, ctx);
    },
  });
}
