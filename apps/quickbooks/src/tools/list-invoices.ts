/**
 * list_invoices — list QuickBooks Online invoices via query.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerListInvoicesTool(app: AgentApp): void {
  app.tool('list_invoices', {
    description:
      'List invoices from your QuickBooks Online account. Returns up to maxResults invoices.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of invoices to return (1-1000, default 100).',
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
        `query?query=SELECT * FROM Invoice MAXRESULTS ${maxResults}`,
        null,
        ctx,
      );
    },
  });
}
