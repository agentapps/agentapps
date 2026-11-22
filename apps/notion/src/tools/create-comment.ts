import type { AgentApp } from '@agentapps/sdk';
import { getNotionClient } from '../lib/notion-client.js';
import { COMMENT_FIELDS } from './_fields.js';
import { extractCommentShape, validateUuid } from './_notion-helpers.js';
import { resolveFields, wrapNotionWrite } from './utils.js';

export function registerCreateCommentTool(app: AgentApp): void {
  app.tool('create-comment', {
    description:
      'Post a comment on a page (pass pageId) or reply to a discussion (pass discussionId). Returns the curated comment { id, pageId, parentBlockId, authorId, plainText, createdTime }. Not retryable.',
    parameters: {
      type: 'object',
      properties: {
        pageId: {
          type: 'string',
          description: 'Page UUID. Mutually exclusive with discussionId.',
        },
        discussionId: {
          type: 'string',
          description: 'Discussion UUID to reply to. Mutually exclusive with pageId.',
        },
        text: {
          type: 'string',
          description: 'Comment text (plain).',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Notion comment. Default false.',
        },
      },
      required: ['text'],
    },
    // A comment can be removed again with delete-comment, so posting one is not destructive.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
      version: '1.1.0',
      stability: 'stable',
    },
    handler: async (args: any, ctx) => {
      const client = await getNotionClient(ctx);
      const { pageId, discussionId, text, fields, includeRaw } = args as {
        pageId?: string;
        discussionId?: string;
        text: string;
        fields?: string[];
        includeRaw?: boolean;
      };

      const commentParams: any = { rich_text: [{ text: { content: text } }] };
      if (pageId) {
        validateUuid(pageId, 'pageId');
        commentParams.parent = { page_id: pageId };
      } else if (discussionId) {
        validateUuid(discussionId, 'discussionId');
        commentParams.discussion_id = discussionId;
      } else {
        throw new Error('Either pageId or discussionId must be provided');
      }

      const raw: any = await wrapNotionWrite(() => client.comments.create(commentParams));
      const shape = extractCommentShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: COMMENT_FIELDS,
      });
    },
  });
}
