import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerUpdateCommentTool(app: AgentApp): void {
  app.tool('update-comment', {
    description: 'Update the content of a comment.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'ID of the file',
        },
        commentId: {
          type: 'string',
          description: 'ID of the comment to update',
        },
        content: {
          type: 'string',
          description: 'New content for the comment',
        },
      },
      required: ['fileId', 'commentId', 'content'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { fileId, commentId, content } = args as {
        fileId: string;
        commentId: string;
        content: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.drive.comments.update({
            fileId,
            commentId,
            fields: 'id, content, author, modifiedTime',
            requestBody: {
              content,
            },
          });

          return response.data;
        },
        'update-comment',
      );
    },
  });
}
