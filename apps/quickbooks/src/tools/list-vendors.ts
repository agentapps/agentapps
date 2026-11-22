/**
 * list_vendors — list QuickBooks Online vendors via query.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerListVendorsTool(app: AgentApp): void {
  app.tool('list_vendors', {
    description:
      'List vendors from your QuickBooks Online account. Returns up to maxResults vendors.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of vendors to return (1-1000, default 100).',
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
        `query?query=SELECT * FROM Vendor MAXRESULTS ${maxResults}`,
        null,
        ctx,
      );
    },
  });
}
