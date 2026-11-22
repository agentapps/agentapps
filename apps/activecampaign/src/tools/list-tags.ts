import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { buildPaginated, parseTag, wrap } from './_helpers.js';

export function registerListTagsTool(app: AgentApp): void {
  app.tool('list-tags', {
    description: 'List tags. Returns { items[{id,name,description,tagType}], total, nextOffset }.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const limit = Math.min(Math.max((args as any).limit ?? 20, 1), 100);
      const offset = Math.max((args as any).offset ?? 0, 0);
      const raw = (await acRequest(ctx, '/tags', {
        searchParams: { limit, offset, search: (args as any).search },
      })) as { tags?: unknown[]; meta?: unknown };
      const items = (raw.tags ?? []).map(parseTag);
      const data = buildPaginated(items, raw.meta, offset, limit);
      return wrap({
        tags: data.items,
        total: data.total,
        nextOffset: data.nextOffset,
      });
    },
  });
}
