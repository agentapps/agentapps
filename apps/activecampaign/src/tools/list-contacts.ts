import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { buildPaginated, parseContact, wrap } from './_helpers.js';

export function registerListContactsTool(app: AgentApp): void {
  app.tool('list-contacts', {
    description:
      'List contacts. Returns { items[{id,email,firstName,lastName,phone}], total, nextOffset }. Filter by email, free-text search, or listId.',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        search: { type: 'string' },
        listId: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const limit = Math.min(Math.max((args as any).limit ?? 20, 1), 100);
      const offset = Math.max((args as any).offset ?? 0, 0);
      const raw = (await acRequest(ctx, '/contacts', {
        searchParams: {
          email: (args as any).email,
          search: (args as any).search,
          listid: (args as any).listId,
          limit,
          offset,
        },
      })) as { contacts?: unknown[]; meta?: unknown };
      const items = (raw.contacts ?? []).map(parseContact);
      const data = buildPaginated(items, raw.meta, offset, limit);
      return wrap({
        contacts: data.items,
        total: data.total,
        nextOffset: data.nextOffset,
      });
    },
  });
}
