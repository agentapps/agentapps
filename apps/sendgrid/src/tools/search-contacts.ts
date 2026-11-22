/**
 * search-contacts — POST /marketing/contacts/search
 *
 * Search contacts using SendGrid's SGQL query language.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

interface SearchContactsResponse {
  result?: unknown[];
  contact_count?: number;
}

export function registerSearchContactsTool(app: AgentApp): void {
  app.tool('search-contacts', {
    description:
      "Search contacts in SendGrid Marketing Campaigns using SGQL (POST /marketing/contacts/search). Example query: \"email LIKE '%example.com' AND CONTAINS(list_ids, 'abc-123')\". Returns { contacts, contactCount }.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'SGQL query string (e.g. "email LIKE \'%@example.com\'" or "first_name = \'Alice\'").',
        },
      },
      required: ['query'],
    },
    // A POST that only runs a search query; nothing is written.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const query = args.query as string;

      if (!query || query.trim().length === 0) {
        throw new Error('A SGQL query string is required.');
      }

      const res = (await sendgridRequest(
        'POST',
        '/marketing/contacts/search',
        { query: query.trim() },
        ctx,
      )) as SearchContactsResponse;

      return {
        contacts: res.result ?? [],
        contactCount: res.contact_count ?? 0,
      };
    },
  });
}
