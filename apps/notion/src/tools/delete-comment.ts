import type { AgentApp } from '@agentapps/sdk';
import { getNotionClient } from '../lib/notion-client.js';
import { NotionApiError } from '../lib/notion-error.js';
import { validateUuid } from './_notion-helpers.js';
import { wrapNotionWrite } from './utils.js';

export function registerDeleteCommentTool(app: AgentApp): void {
  app.tool('delete-comment', {
    description:
      'Delete a comment by id. Returns { id, deleted: true }. Destructive: a deleted comment cannot be recovered. Idempotent — re-deleting an already-deleted comment is a no-op from the agent perspective (Notion 404s, we coerce to deleted=true).',
    parameters: {
      type: 'object',
      properties: {
        commentId: { type: 'string', description: 'Comment UUID.' },
      },
      required: ['commentId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      version: '1.0.0',
      stability: 'stable',
      destructiveHint: true,
      idempotentHint: true,
    },
    handler: async (args: any, ctx) => {
      const client = await getNotionClient(ctx);
      const { commentId } = args as { commentId: string };
      validateUuid(commentId, 'commentId');

      try {
        await wrapNotionWrite(() => (client as any).comments.delete({ comment_id: commentId }));
        return { id: commentId, deleted: true };
      } catch (err) {
        // Idempotency: re-deleting an already-deleted comment Notion-404s → coerce.
        if (err instanceof NotionApiError && err.classified.code === 'NOT_FOUND') {
          return { id: commentId, deleted: true };
        }
        throw err;
      }
    },
  });
}
