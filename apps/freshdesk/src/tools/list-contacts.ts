import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * list-contacts — GET /contacts
 *
 * Lists contacts from the Freshdesk helpdesk.
 */
export function registerListContactsTool(app: AgentApp): void {
  app.tool('list-contacts', {
    description:
      'List Freshdesk contacts (GET /api/v2/contacts). Optional filters: email, phone, mobile, page, per_page. Returns contact id, name, email, phone, and other profile fields.',
    parameters: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Filter contacts by email address.',
        },
        phone: {
          type: 'string',
          description: 'Filter contacts by phone number.',
        },
        mobile: {
          type: 'string',
          description: 'Filter contacts by mobile number.',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default 1).',
        },
        per_page: {
          type: 'number',
          description: 'Results per page (default 30, max 100).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const params: Record<string, unknown> = {};
      if (a.email !== undefined) params.email = a.email;
      if (a.phone !== undefined) params.phone = a.phone;
      if (a.mobile !== undefined) params.mobile = a.mobile;
      if (a.page !== undefined) params.page = a.page;
      if (a.per_page !== undefined) params.per_page = a.per_page;

      const hasParams = Object.keys(params).length > 0;
      const contacts = await freshdeskRequest<unknown[]>(
        'GET',
        '/contacts',
        hasParams ? params : undefined,
        ctx,
      );

      return { count: contacts.length, contacts };
    },
  });
}
