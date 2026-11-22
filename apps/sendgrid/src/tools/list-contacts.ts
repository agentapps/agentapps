/**
 * list-contacts — GET /marketing/contacts
 *
 * Retrieve all contacts from the SendGrid Marketing Campaigns API.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

interface ListContactsResponse {
  result?: unknown[];
  contact_count?: number;
}

export function registerListContactsTool(app: AgentApp): void {
  app.tool('list-contacts', {
    description:
      'List all contacts from SendGrid Marketing Campaigns (GET /marketing/contacts). Returns { contacts, contactCount }.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const res = (await sendgridRequest(
        'GET',
        '/marketing/contacts',
        null,
        ctx,
      )) as ListContactsResponse;

      return {
        contacts: res.result ?? [],
        contactCount: res.contact_count ?? 0,
      };
    },
  });
}
