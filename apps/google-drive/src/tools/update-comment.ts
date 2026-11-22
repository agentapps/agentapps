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
    // Setting the content again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
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
