import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

interface PersonResource {
  resourceName?: string;
  etag?: string;
  names?: { displayName?: string; givenName?: string; familyName?: string }[];
  emailAddresses?: { value?: string }[];
  phoneNumbers?: { value?: string }[];
  organizations?: { name?: string; title?: string }[];
}

/**
 * update-contact — PATCH /people/{resourceName}:updateContact.
 *
 * Updates an existing contact. First fetches the current contact to get the
 * etag, then applies the requested changes.
 */
export function registerUpdateContactTool(app: AgentApp): void {
  app.tool('update-contact', {
    description:
      "Update an existing contact in Google Contacts. Fetches the current contact first for the etag. Returns { resourceName, name }. Params: resourceName (required — e.g. 'people/c123456789'), givenName?, familyName?, email?, phone?, organization?, title?.",
    parameters: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: "Contact resource name (e.g., 'people/c123456789')",
        },
        givenName: { type: 'string', description: 'First name' },
        familyName: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        organization: { type: 'string', description: 'Company/organization name' },
        title: { type: 'string', description: 'Job title' },
      },
      required: ['resourceName'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const resourceName = args.resourceName as string;
      if (!resourceName || typeof resourceName !== 'string') {
        throw new Error('resourceName is required.');
      }

      const givenName = args.givenName as string | undefined;
      const familyName = args.familyName as string | undefined;
      const email = args.email as string | undefined;
      const phone = args.phone as string | undefined;
      const organization = args.organization as string | undefined;
      const title = args.title as string | undefined;

      // Fetch the current contact to get the etag.
      const current = await googlePeopleRequest<PersonResource>(ctx, `/${resourceName}`, {
        query: { personFields: 'names,emailAddresses,phoneNumbers,organizations' },
      });

      const updatePersonFields: string[] = [];
      const requestBody: Record<string, unknown> = {
        etag: current.etag,
      };

      if (givenName !== undefined || familyName !== undefined) {
        requestBody.names = [
          {
            givenName: givenName ?? current.names?.[0]?.givenName,
            familyName: familyName ?? current.names?.[0]?.familyName,
          },
        ];
        updatePersonFields.push('names');
      }

      if (email !== undefined) {
        requestBody.emailAddresses = [{ value: email }];
        updatePersonFields.push('emailAddresses');
      }

      if (phone !== undefined) {
        requestBody.phoneNumbers = [{ value: phone }];
        updatePersonFields.push('phoneNumbers');
      }

      if (organization !== undefined || title !== undefined) {
        requestBody.organizations = [
          {
            name: organization ?? current.organizations?.[0]?.name,
            title: title ?? current.organizations?.[0]?.title,
          },
        ];
        updatePersonFields.push('organizations');
      }

      if (updatePersonFields.length === 0) {
        return { success: false, message: 'No fields to update' };
      }

      const response = await googlePeopleRequest<PersonResource>(
        ctx,
        `/${resourceName}:updateContact`,
        {
          method: 'PATCH',
          query: {
            updatePersonFields: updatePersonFields.join(','),
            personFields: 'names,emailAddresses,phoneNumbers,organizations',
          },
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
