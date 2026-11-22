import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

const PERSON_FIELDS =
  'names,emailAddresses,phoneNumbers,organizations,addresses,biographies,photos';

interface ConnectionsResponse {
  connections?: PersonResource[];
  totalItems?: number;
  nextPageToken?: string;
}

interface PersonResource {
  resourceName?: string;
  names?: { displayName?: string; givenName?: string; familyName?: string }[];
  emailAddresses?: { value?: string }[];
  phoneNumbers?: { value?: string; type?: string }[];
  organizations?: { name?: string; title?: string }[];
  photos?: { url?: string }[];
}

/**
 * list-contacts — GET /people/me/connections.
 *
 * Lists the authenticated user's contacts with pagination support.
 */
export function registerListContactsTool(app: AgentApp): void {
  app.tool('list-contacts', {
    description:
      'List contacts from Google Contacts. Returns name, email, phone numbers. Supports pagination. Params: pageSize? (default 100, max 1000), pageToken? (from previous response).',
    parameters: {
      type: 'object',
      properties: {
        pageSize: {
          type: 'number',
          description: 'Number of contacts per page (default: 100, max: 1000)',
        },
        pageToken: {
          type: 'string',
          description: 'Token for pagination (from previous response)',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const pageSize = Math.min(Number(args.pageSize ?? 100), 1000);
      const pageToken = args.pageToken as string | undefined;

      const query: Record<string, string | number | undefined> = {
        personFields: PERSON_FIELDS,
        pageSize,
        pageToken,
      };

      const response = await googlePeopleRequest<ConnectionsResponse>(
        ctx,
        '/people/me/connections',
        { query },
      );

      const contacts = (response.connections ?? []).map((person) => ({
        resourceName: person.resourceName,
        name: person.names?.[0]?.displayName,
        givenName: person.names?.[0]?.givenName,
        familyName: person.names?.[0]?.familyName,
        emails: person.emailAddresses?.map((e) => e.value),
        phones: person.phoneNumbers?.map((p) => ({ value: p.value, type: p.type })),
        organization: person.organizations?.[0]?.name,
        title: person.organizations?.[0]?.title,
        photo: person.photos?.[0]?.url,
      }));

      return {
        contacts,
        totalItems: response.totalItems,
        nextPageToken: response.nextPageToken,
      };
    },
  });
}
