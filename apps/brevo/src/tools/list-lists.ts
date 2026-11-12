import type { AgentApp } from '@agentapps/sdk';
import { brevoRequest } from '../lib/brevo-client.js';
import { clampInt, shapeList } from './_helpers.js';

interface ListListsResponse {
  lists?: unknown[];
  count?: number;
}

/**
 * list-lists — GET /contacts/lists.
 */
export function registerListListsTool(app: AgentApp): void {
  app.tool('list-lists', {
    description:
      'List contact lists from Brevo (GET /contacts/lists). Returns { lists:[{id,name,folderId,totalSubscribers,uniqueSubscribers,totalBlacklisted}], count, limit, offset }. Params: limit? (1-50, default 50), offset? (default 0).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max lists to return (1-50, default 50).',
          default: 50,
        },
        offset: {
          type: 'number',
          description: 'Index of the first list for pagination (default 0).',
          default: 0,
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const limit = clampInt(a.limit, 1, 50, 50);
      const offset = clampInt(a.offset, 0, Number.MAX_SAFE_INTEGER, 0);

      const res = await brevoRequest<ListListsResponse>(ctx, '/contacts/lists', {
        query: { limit, offset },
      });

      const lists = (res.lists ?? []).map(shapeList);
      return {
        lists,
        count: typeof res.count === 'number' ? res.count : lists.length,
        limit,
        offset,
      };
    },
  });
}
