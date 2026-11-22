import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

interface CreateContactResponse {
  resourceName?: string;
  names?: { displayName?: string }[];
}

/**
 * create-contact — POST /people:createContact.
 *
 * Creates a new contact in the user's Google Contacts.
 */
export function registerCreateContactTool(app: AgentApp): void {
  app.tool('create-contact', {
    description:
      'Create a new contact in Google Contacts (POST /people:createContact). Returns { resourceName, name }. Params: givenName (required), familyName?, email?, phone?, organization?, title?, notes?.',
    parameters: {
      type: 'object',
      properties: {
        givenName: { type: 'string', description: 'First name' },
        familyName: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        organization: { type: 'string', description: 'Company/organization name' },
        title: { type: 'string', description: 'Job title' },
        notes: { type: 'string', description: 'Notes/biography' },
      },
      required: ['givenName'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const givenName = args.givenName as string;
      if (!givenName || typeof givenName !== 'string') {
        throw new Error('givenName is required.');
      }

      const familyName = args.familyName as string | undefined;
      const email = args.email as string | undefined;
      const phone = args.phone as string | undefined;
      const organization = args.organization as string | undefined;
      const title = args.title as string | undefined;
      const notes = args.notes as string | undefined;

      const requestBody: Record<string, unknown> = {
        names: [{ givenName, familyName }],
      };

      if (email) {
        requestBody.emailAddresses = [{ value: email }];
      }
      if (phone) {
        requestBody.phoneNumbers = [{ value: phone }];
      }
      if (organization || title) {
        requestBody.organizations = [{ name: organization, title }];
      }
      if (notes) {
        requestBody.biographies = [{ value: notes, contentType: 'TEXT_PLAIN' }];
      }

      const response = await googlePeopleRequest<CreateContactResponse>(
        ctx,
        '/people:createContact',
        {
          method: 'POST',
          query: { personFields: 'names,emailAddresses,phoneNumbers,organizations,biographies' },
          body: requestBody,
        },
      );

      return {
        success: true,
        resourceName: response.resourceName,
        name: response.names?.[0]?.displayName,
      };
    },
  });
}
