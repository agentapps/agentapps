/**
 * get_invoice — retrieve a single Stripe invoice by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { stripeRequest } from '../lib/stripe-client.js';

export function registerGetInvoiceTool(app: AgentApp): void {
  app.tool('get_invoice', {
    description: 'Get detailed information about a specific Stripe invoice.',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: {
          type: 'string',
          description: 'The invoice ID (e.g. in_...).',
        },
      },
      required: ['invoiceId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const invoiceId = args.invoiceId as string;
      return await stripeRequest('GET', `/invoices/${invoiceId}`, null, ctx);
    },
  });
}
