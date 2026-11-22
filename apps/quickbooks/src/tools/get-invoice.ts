/**
 * get-invoice — retrieve a single QuickBooks Online invoice by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerGetInvoiceTool(app: AgentApp): void {
  app.tool('get-invoice', {
    description: 'Get detailed information about a specific QuickBooks invoice.',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: {
          type: 'string',
          description: 'The QuickBooks invoice ID.',
        },
      },
      required: ['invoiceId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const invoiceId = args.invoiceId as string;
      return await quickbooksRequest('GET', `invoice/${invoiceId}`, null, ctx);
    },
  });
}
