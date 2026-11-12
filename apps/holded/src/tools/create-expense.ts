/**
 * create_expense — create a new Holded expense.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerCreateExpenseTool(app: AgentApp): void {
  app.tool('create_expense', {
    description:
      'Create a new expense in Holded. Requires a contact ID and at least one line item.',
    parameters: {
      type: 'object',
      properties: {
        contactId: {
          type: 'string',
          description: 'The Holded contact (supplier) ID for this expense.',
        },
        items: {
          type: 'array',
          description: 'Line items for the expense.',
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
          description: 'Expense description / notes.',
        },
        date: {
          type: 'number',
          description: 'Expense date as UNIX timestamp (seconds).',
        },
        notes: {
          type: 'string',
          description: 'Additional notes for the expense.',
        },
      },
      required: ['contactId', 'items'],
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        contactId: args.contactId,
        items: args.items,
      };
      if (args.desc) body.desc = args.desc;
      if (args.date) body.date = args.date;
      if (args.notes) body.notes = args.notes;

      return await holdedRequest('POST', 'invoicing/v1/documents/expense', body, ctx);
    },
  });
}
