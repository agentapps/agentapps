/**
 * list_customers — list QuickBooks Online customers via query.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerListCustomersTool(app: AgentApp): void {
  app.tool('list_customers', {
    description:
      'List customers from your QuickBooks Online account. Returns up to maxResults customers.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of customers to return (1-1000, default 100).',
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
        `query?query=SELECT * FROM Customer MAXRESULTS ${maxResults}`,
        null,
        ctx,
      );
    },
  });
}
