import type { AgentApp } from '@agentapps/sdk';
import { intercomRequest } from '../lib/intercom-client.js';

/**
 * search-contacts — POST /contacts/search.
 */
export function registerSearchContactsTool(app: AgentApp): void {
  app.tool('search-contacts', {
    description: 'Search Intercom contacts by email, name, or phone number.',
    parameters: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Filter by exact email address',
        },
        name: {
          type: 'string',
          description: 'Filter by name (partial match)',
        },
        phone: {
          type: 'string',
          description: 'Filter by phone number',
        },
        perPage: {
          type: 'number',
          description: 'Results per page (default: 20, max: 50)',
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
      const a = (args ?? {}) as Record<string, unknown>;
      const email = a.email as string | undefined;
      const name = a.name as string | undefined;
      const phone = a.phone as string | undefined;
      const perPage = typeof a.perPage === 'number' ? a.perPage : 20;

      const conditions: unknown[] = [];
      if (email) conditions.push({ field: 'email', operator: '=', value: email });
      if (name) conditions.push({ field: 'name', operator: '~', value: name });
      if (phone) conditions.push({ field: 'phone', operator: '=', value: phone });

      const query =
        conditions.length === 1
          ? conditions[0]
          : conditions.length > 1
            ? { operator: 'AND', value: conditions }
            : { field: 'email', operator: '!=', value: '' }; // fallback: all contacts

      const result = await intercomRequest<Record<string, unknown>>(ctx, '/contacts/search', {
        method: 'POST',
        body: { query, pagination: { per_page: Math.min(perPage, 50) } },
      });

      const contacts = (result.data as Array<Record<string, unknown>>) ?? [];
      return {
        totalCount: (result.pages as Record<string, unknown> | undefined)?.total_count,
        count: contacts.length,
        contacts: contacts.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          createdAt: c.created_at,
          lastSeenAt: c.last_seen_at,
        })),
      };
    },
  });
}
