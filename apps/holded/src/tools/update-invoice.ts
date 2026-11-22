/**
 * update_invoice — update an existing Holded invoice.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerUpdateInvoiceTool(app: AgentApp): void {
  app.tool('update_invoice', {
    description: 'Update an existing invoice in Holded. Only provided fields are changed.',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: {
          type: 'string',
          description: 'The Holded invoice ID to update.',
        },
        contactId: {
          type: 'string',
          description: 'The Holded contact ID to invoice.',
        },
        items: {
          type: 'array',
          description: 'Line items for the invoice (replaces existing items).',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Item name / description.',
              },
              units: {
                type: 'number',
                description: 'Quantity.',
              },
              subtotal: {
                type: 'number',
                description: 'Unit price (before tax).',
              },
              tax: {
                type: 'number',
                description: 'Tax percentage (e.g. 21 for 21% IVA).',
              },
            },
            required: ['name', 'units', 'subtotal'],
          },
        },
        desc: {
          type: 'string',
          description: 'Invoice description / notes.',
        },
        date: {
          type: 'number',
          description: 'Invoice date as UNIX timestamp (seconds).',
        },
        notes: {
          type: 'string',
          description: 'Additional notes for the invoice.',
        },
      },
      required: ['invoiceId'],
    },
    // Setting the fields again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const invoiceId = args.invoiceId as string;
      const body: Record<string, unknown> = {};
      if (args.contactId) body.contactId = args.contactId;
      if (args.items) body.items = args.items;
      if (args.desc) body.desc = args.desc;
      if (args.date) body.date = args.date;
      if (args.notes) body.notes = args.notes;

      return await holdedRequest('PUT', `invoicing/v1/documents/invoice/${invoiceId}`, body, ctx);
    },
  });
}
