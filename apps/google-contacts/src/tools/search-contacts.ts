import type { AgentApp } from '@agentapps/sdk';
import { googlePeopleRequest } from '../lib/google-client.js';

const READ_MASK = 'names,emailAddresses,phoneNumbers,organizations,photos';

interface SearchResult {
  person?: {
    resourceName?: string;
    names?: { displayName?: string }[];
    emailAddresses?: { value?: string }[];
    phoneNumbers?: { value?: string }[];
    organizations?: { name?: string }[];
    photos?: { url?: string }[];
  };
}

interface SearchResponse {
  results?: SearchResult[];
}

/**
 * search-contacts — GET /people:searchContacts.
 *
 * Searches the user's contacts by query string (name, email, phone, etc.).
 */
export function registerSearchContactsTool(app: AgentApp): void {
  app.tool('search-contacts', {
    description:
      'Search for contacts by query (name, email, phone, etc.). Returns matching contacts with name, emails, phones, organization, and photo. Params: query (required), pageSize? (default 30, max 30).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (name, email, phone, etc.)',
        },
        pageSize: {
          type: 'number',
          description: 'Number of results per page (default: 30, max: 30)',
        },
      },
      required: ['query'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const query = args.query as string;
      if (!query || typeof query !== 'string') {
        throw new Error('query is required.');
      }
      const pageSize = Math.min(Number(args.pageSize ?? 30), 30);

      const response = await googlePeopleRequest<SearchResponse>(ctx, '/people:searchContacts', {
        query: {
          query,
          pageSize,
          readMask: READ_MASK,
        },
      });

      const contacts = (response.results ?? []).map((result) => {
        const person = result.person;
        return {
          resourceName: person?.resourceName,
          name: person?.names?.[0]?.displayName,
          emails: person?.emailAddresses?.map((e) => e.value),
          phones: person?.phoneNumbers?.map((p) => p.value),
          organization: person?.organizations?.[0]?.name,
          photo: person?.photos?.[0]?.url,
        };
      });

      return { contacts };
    },
  });
}
