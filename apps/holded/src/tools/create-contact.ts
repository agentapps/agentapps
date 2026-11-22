/**
 * create-contact — create a new Holded contact.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerCreateContactTool(app: AgentApp): void {
  app.tool('create-contact', {
    description: 'Create a new contact in Holded. Returns the created contact object.',
    parameters: {
      type: 'object',
      properties: {
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
          description: 'Contact type (default: client).',
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
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        name: args.name,
      };
      if (args.email) body.email = args.email;
      if (args.phone) body.phone = args.phone;
      if (args.vatnumber) body.vatnumber = args.vatnumber;
      if (args.type) body.type = args.type;
      if (args.tradeName) body.tradeName = args.tradeName;
      if (args.address) body.address = args.address;

      return await holdedRequest('POST', 'invoicing/v1/contacts', body, ctx);
    },
  });
}
