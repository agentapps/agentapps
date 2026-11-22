/**
 * add-contact — PUT /marketing/contacts
 *
 * Add or update contacts in SendGrid Marketing Campaigns.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

export function registerAddContactTool(app: AgentApp): void {
  app.tool('add-contact', {
    description:
      'Add or update contacts in SendGrid Marketing Campaigns (PUT /marketing/contacts). Accepts an array of contact objects with at least an email field.',
    parameters: {
      type: 'object',
      properties: {
        contacts: {
          type: 'array',
          description:
            'Array of contact objects. Each must have at least { email }. Optional fields: first_name, last_name, custom_fields.',
          items: {
            type: 'object',
            properties: {
              email: { type: 'string', description: 'Contact email address.' },
              first_name: { type: 'string', description: 'First name.' },
              last_name: { type: 'string', description: 'Last name.' },
            },
            required: ['email'],
          },
        },
      },
      required: ['contacts'],
    },
    // An upsert by email: it adds the contact or sets its fields, and can be set back.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const contacts = args.contacts as Array<Record<string, unknown>>;

      if (!contacts || contacts.length === 0) {
        throw new Error('At least one contact is required.');
      }

      const res = await sendgridRequest('PUT', '/marketing/contacts', { contacts }, ctx);

      return res;
    },
  });
}
