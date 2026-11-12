import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * get-contact — Retrieve a single Salesforce contact by ID.
 * GET /services/data/v59.0/sobjects/Contact/{contactId}
 */
export function registerGetContactTool(app: AgentApp): void {
  app.tool('get-contact', {
    description:
      'Retrieve a Salesforce contact by ID. Returns the full contact record. Params: contactId (required).',
    parameters: {
      type: 'object',
      properties: {
        contactId: {
          type: 'string',
          description: 'Salesforce Contact ID (18-char).',
        },
      },
      required: ['contactId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { contactId } = args as { contactId: string };

      const data = (await salesforceRequest(
        'GET',
        `sobjects/Contact/${encodeURIComponent(contactId)}`,
        undefined,
        ctx,
      )) as any;

      return {
        id: data.Id,
        firstName: data.FirstName ?? null,
        lastName: data.LastName ?? null,
        email: data.Email ?? null,
        phone: data.Phone ?? null,
        title: data.Title ?? null,
        department: data.Department ?? null,
        accountId: data.AccountId ?? null,
        mailingCity: data.MailingCity ?? null,
        mailingState: data.MailingState ?? null,
        mailingCountry: data.MailingCountry ?? null,
        ownerId: data.OwnerId ?? null,
        createdDate: data.CreatedDate ?? null,
        lastModifiedDate: data.LastModifiedDate ?? null,
      };
    },
  });
}
