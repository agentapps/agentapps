/**
 * get_invoice — retrieve a single Holded invoice by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerGetInvoiceTool(app: AgentApp): void {
  app.tool('get_invoice', {
    description: 'Get detailed information about a specific Holded invoice.',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: {
          type: 'string',
          description: 'The Holded invoice ID.',
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
      return await holdedRequest('GET', `invoicing/v1/documents/invoice/${invoiceId}`, null, ctx);
    },
  });
}
