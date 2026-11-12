import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { buildPaginated, parseList, wrap } from './_helpers.js';

export function registerListListsTool(app: AgentApp): void {
  app.tool('list-lists', {
    description:
      'List subscriber lists. Returns { items[{id,name,stringid,subscriberCount}], total, nextOffset }.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const limit = Math.min(Math.max((args as any).limit ?? 20, 1), 100);
      const offset = Math.max((args as any).offset ?? 0, 0);
      const raw = (await acRequest(ctx, '/lists', {
        searchParams: { limit, offset },
      })) as { lists?: unknown[]; meta?: unknown };
      const items = (raw.lists ?? []).map(parseList);
      const data = buildPaginated(items, raw.meta, offset, limit);
      return wrap({
        lists: data.items,
        total: data.total,
        nextOffset: data.nextOffset,
      });
    },
  });
}
