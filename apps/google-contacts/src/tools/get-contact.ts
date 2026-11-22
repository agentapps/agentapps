import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

const PERSON_FIELDS =
  'names,emailAddresses,phoneNumbers,organizations,addresses,biographies,photos,birthdays,urls';

interface PersonResource {
  resourceName?: string;
  etag?: string;
  names?: { displayName?: string; givenName?: string; familyName?: string }[];
  emailAddresses?: { value?: string; type?: string }[];
  phoneNumbers?: { value?: string; type?: string }[];
  organizations?: { name?: string; title?: string }[];
  addresses?: { formattedValue?: string; type?: string; city?: string; country?: string }[];
  biographies?: { value?: string }[];
  birthdays?: { date?: unknown }[];
  urls?: { value?: string; type?: string }[];
  photos?: { url?: string }[];
}

/**
 * get-contact — GET /people/{resourceName}.
 *
 * Retrieves detailed information for a single contact.
 */
export function registerGetContactTool(app: AgentApp): void {
  app.tool('get-contact', {
    description:
      "Get a specific contact by resource name (GET /people/{resourceName}). Returns detailed info including name, emails, phones, organizations, addresses, biographies, birthdays, urls, and photo. Params: resourceName (required — e.g. 'people/c123456789').",
    parameters: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: "Contact resource name (e.g., 'people/c123456789')",
        },
      },
      required: ['resourceName'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const resourceName = args.resourceName as string;
      if (!resourceName || typeof resourceName !== 'string') {
        throw new Error('resourceName is required.');
      }

      const person = await googlePeopleRequest<PersonResource>(ctx, `/${resourceName}`, {
        query: { personFields: PERSON_FIELDS },
      });

      return {
        resourceName: person.resourceName,
        etag: person.etag,
        name: person.names?.[0]?.displayName,
        givenName: person.names?.[0]?.givenName,
        familyName: person.names?.[0]?.familyName,
        emails: person.emailAddresses?.map((e) => ({ value: e.value, type: e.type })),
        phones: person.phoneNumbers?.map((p) => ({ value: p.value, type: p.type })),
        organizations: person.organizations?.map((o) => ({ name: o.name, title: o.title })),
        addresses: person.addresses?.map((a) => ({
          formattedValue: a.formattedValue,
          type: a.type,
          city: a.city,
          country: a.country,
        })),
        biographies: person.biographies?.map((b) => b.value),
        birthdays: person.birthdays?.map((b) => b.date),
        urls: person.urls?.map((u) => ({ value: u.value, type: u.type })),
        photo: person.photos?.[0]?.url,
      };
    },
  });
}
