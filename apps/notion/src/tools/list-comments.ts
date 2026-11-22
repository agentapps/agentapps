import type { AgentApp } from '@agentapps/sdk';
import { getNotionClient } from '../lib/notion-client.js';
import { COMMENT_FIELDS } from './_fields.js';
import { extractCommentShape, validateUuid } from './_notion-helpers.js';
import { resolveFieldsList, sanitizeLimit, wrapNotionCall } from './utils.js';

export function registerListCommentsTool(app: AgentApp): void {
  app.tool('list-comments', {
    description:
      'List comments on a page/block. Returns curated rows { id, pageId, parentBlockId, discussionId, authorId, plainText, createdTime }. Params: blockId, limit (1-100, def 50), startCursor, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        blockId: {
          type: 'string',
          description: 'Block or page UUID.',
        },
        limit: {
          type: 'number',
          description: 'Results per page. Min 1, max 100, default 50.',
        },
        startCursor: {
          type: 'string',
          description: 'Notion pagination cursor.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist per row.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Notion response. Default false.',
        },
      },
      required: ['blockId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
      version: '1.1.0',
      stability: 'stable',
    },
    handler: async (args: any, ctx) => {
      const client = await getNotionClient(ctx);
      const { blockId, limit, startCursor, cursor, fields, includeRaw } = args as {
        blockId: string;
        limit?: number;
        startCursor?: string;
        cursor?: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      const effectiveCursor = startCursor ?? cursor;
      validateUuid(blockId, 'blockId');

      const pageSize = sanitizeLimit(limit, { max: 100, default: 50 });
      const response: any = await wrapNotionCall(() =>
        client.comments.list({
          block_id: blockId,
          page_size: pageSize,
          ...(effectiveCursor ? { start_cursor: effectiveCursor } : {}),
        }),
      );

      const shaped = response.results.map(extractCommentShape);
      const comments = resolveFieldsList(shaped as any, response.results, {
        includeRaw,
        fields,
        defaultFields: COMMENT_FIELDS,
      });

      return {
        comments,
        total: comments.length,
        hasMore: response.has_more,
        nextCursor: response.next_cursor,
      };
    },
  });
}
