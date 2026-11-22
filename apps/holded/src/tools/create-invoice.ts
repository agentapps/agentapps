/**
 * create-invoice — create a new Holded invoice.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerCreateInvoiceTool(app: AgentApp): void {
  app.tool('create-invoice', {
    description:
      'Create a new invoice in Holded. Requires a contact ID and at least one line item.',
    parameters: {
      type: 'object',
      properties: {
        contactId: {
          type: 'string',
          description: 'The Holded contact ID to invoice.',
        },
        items: {
          type: 'array',
          description: 'Line items for the invoice.',
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
      required: ['contactId', 'items'],
    },
    annotations: {
      readOnlyHint: false,
      // Creates the document in Holded; it does not send it or charge anyone.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        contactId: args.contactId,
        items: args.items,
      };
      if (args.desc) body.desc = args.desc;
      if (args.date) body.date = args.date;
      if (args.notes) body.notes = args.notes;

      return await holdedRequest('POST', 'invoicing/v1/documents/invoice', body, ctx);
    },
  });
}
