import type { AgentApp } from '@agentapps/sdk';
import { runnList } from '../lib/runn-client.js';
import type { RunnPlaceholder } from '../lib/types.js';
import { PLACEHOLDER_FIELDS } from './_fields.js';
import { resolveFieldsList, sanitizeLimit } from './utils.js';

export function registerListPlaceholdersTool(app: AgentApp): void {
  app.tool('list-placeholders', {
    description:
      'List Runn placeholders (unnamed role slots used for planning before a real person is assigned). Returns { items: [{ id, firstName, lastName, isArchived, tags, references, createdAt, updatedAt }], total, hasMore, nextCursor }. Params: limit (1-200, def 50), cursor?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Results per page. Min 1, max 200, default 50.' },
        cursor: {
          type: 'string',
          description: 'Pagination cursor from a previous response.nextCursor.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist per row.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Runn placeholder objects. Default false.',
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
      const { limit, cursor, fields, includeRaw } = (args ?? {}) as {
        limit?: number;
        cursor?: string;
        fields?: string[];
        includeRaw?: boolean;
      };

      const page = await runnList<RunnPlaceholder>('/placeholders', ctx, {
        limit: sanitizeLimit(limit, { max: 200, default: 50 }),
        cursor,
      });
      const items = resolveFieldsList(page.values as any, page.values, {
        includeRaw,
        fields,
        defaultFields: PLACEHOLDER_FIELDS,
      });
      return {
        items,
        total: items.length,
        hasMore: page.nextCursor !== null,
        nextCursor: page.nextCursor,
      };
    },
  });
}
