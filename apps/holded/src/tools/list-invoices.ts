/**
 * list-invoices — list Holded invoices.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerListInvoicesTool(app: AgentApp): void {
  app.tool('list-invoices', {
    description: 'List invoices from your Holded account. Returns all sales invoices.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number for pagination (default 1).',
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
      let path = 'invoicing/v1/documents/invoice';
      if (args.page) {
        path += `?page=${args.page}`;
      }
      return await holdedRequest('GET', path, null, ctx);
    },
  });
}
