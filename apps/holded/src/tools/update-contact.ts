/**
 * update-contact — update an existing Holded contact.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerUpdateContactTool(app: AgentApp): void {
  app.tool('update-contact', {
    description: 'Update an existing contact in Holded. Only provided fields are changed.',
    parameters: {
      type: 'object',
      properties: {
        contactId: {
          type: 'string',
          description: 'The Holded contact ID to update.',
        },
        name: {
          type: 'string',
          description: 'Contact name (person or company).',
        },
        email: {
          type: 'string',
          description: 'Contact email address.',
        },
        phone: {
          type: 'string',
          description: 'Contact phone number.',
        },
        vatnumber: {
          type: 'string',
          description: 'Tax identification number (NIF/CIF/VAT).',
        },
        type: {
          type: 'string',
          enum: ['client', 'supplier', 'debtor', 'creditor'],
          description: 'Contact type.',
        },
        tradeName: {
          type: 'string',
          description: 'Trade / commercial name.',
        },
        address: {
          type: 'object',
          description: 'Contact address.',
          properties: {
            street: { type: 'string', description: 'Street address.' },
            city: { type: 'string', description: 'City.' },
            postalCode: { type: 'string', description: 'Postal / ZIP code.' },
            province: { type: 'string', description: 'Province / state.' },
            country: { type: 'string', description: 'Country code (e.g. ES).' },
          },
        },
      },
      required: ['contactId'],
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
      const contactId = args.contactId as string;
      const body: Record<string, unknown> = {};
      if (args.name) body.name = args.name;
      if (args.email) body.email = args.email;
      if (args.phone) body.phone = args.phone;
      if (args.vatnumber) body.vatnumber = args.vatnumber;
      if (args.type) body.type = args.type;
      if (args.tradeName) body.tradeName = args.tradeName;
      if (args.address) body.address = args.address;

      return await holdedRequest('PUT', `invoicing/v1/contacts/${contactId}`, body, ctx);
    },
  });
}
