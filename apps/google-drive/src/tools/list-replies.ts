import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerListRepliesTool(app: AgentApp): void {
  app.tool('list-replies', {
    description: 'List all replies to a comment.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'ID of the file',
        },
        commentId: {
          type: 'string',
          description: 'ID of the comment',
        },
        pageSize: {
          type: 'number',
          description: 'Optional: Maximum number of replies to return (default: 100)',
        },
      },
      required: ['fileId', 'commentId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const {
        fileId,
        commentId,
        pageSize = 100,
      } = args as {
        fileId: string;
        commentId: string;
        pageSize?: number;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.drive.replies.list({
            fileId,
            commentId,
            pageSize,
            fields: 'replies(id, content, author, createdTime, modifiedTime, action)',
          });

          return {
            replies: response.data.replies || [],
          };
        },
        'list-replies',
      );
    },
  });
}
