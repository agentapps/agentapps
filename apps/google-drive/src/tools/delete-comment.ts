import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerDeleteCommentTool(app: AgentApp): void {
  app.tool('delete-comment', {
    description: 'Delete a comment.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'ID of the file',
        },
        commentId: {
          type: 'string',
          description: 'ID of the comment to delete',
        },
      },
      required: ['fileId', 'commentId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { fileId, commentId } = args as { fileId: string; commentId: string };

      return withAuthRetry(
        ctx,
        async () => {
          await clients.drive.comments.delete({
            fileId,
            commentId,
          });

          return {
            success: true,
            message: `Comment ${commentId} deleted successfully`,
          };
        },
        'delete-comment',
      );
    },
  });
}
