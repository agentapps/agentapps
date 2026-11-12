import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * create-contact — Create a new Salesforce contact.
 * POST /services/data/v59.0/sobjects/Contact
 */
export function registerCreateContactTool(app: AgentApp): void {
  app.tool('create-contact', {
    description:
      'Create a new Salesforce contact. Returns the created contact ID. Params: lastName (required), firstName?, email?, accountId?, phone?.',
    parameters: {
      type: 'object',
      properties: {
        lastName: { type: 'string', description: 'Contact last name (required).' },
        firstName: { type: 'string', description: 'Contact first name.' },
        email: { type: 'string', description: 'Contact email address.' },
        accountId: { type: 'string', description: 'Salesforce Account ID to associate with.' },
        phone: { type: 'string', description: 'Contact phone number.' },
      },
      required: ['lastName'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { lastName, firstName, email, accountId, phone } = args as {
        lastName: string;
        firstName?: string;
        email?: string;
        accountId?: string;
        phone?: string;
      };

      const payload: Record<string, string> = { LastName: lastName };
      if (firstName) payload.FirstName = firstName;
      if (email) payload.Email = email;
      if (accountId) payload.AccountId = accountId;
      if (phone) payload.Phone = phone;

      const data = (await salesforceRequest('POST', 'sobjects/Contact', payload, ctx)) as any;

      return {
        id: data.id,
        success: data.success ?? true,
      };
    },
  });
}
