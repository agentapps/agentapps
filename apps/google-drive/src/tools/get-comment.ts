import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerGetCommentTool(app: AgentApp): void {
  app.tool('get-comment', {
    description: 'Get a specific comment by ID.',
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
      },
      required: ['fileId', 'commentId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { fileId, commentId } = args as { fileId: string; commentId: string };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.drive.comments.get({
            fileId,
            commentId,
            fields: 'id, content, author, createdTime, modifiedTime, resolved, replies',
          });

          return response.data;
        },
        'get-comment',
      );
    },
  });
}
