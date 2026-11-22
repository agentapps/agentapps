/**
 * delete-invoice — delete a Holded invoice by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerDeleteInvoiceTool(app: AgentApp): void {
  app.tool('delete-invoice', {
    description: 'Delete an invoice from your Holded account.',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: {
          type: 'string',
          description: 'The Holded invoice ID to delete.',
        },
      },
      required: ['invoiceId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const invoiceId = args.invoiceId as string;
      return await holdedRequest(
        'DELETE',
        `invoicing/v1/documents/invoice/${invoiceId}`,
        null,
        ctx,
      );
    },
  });
}
