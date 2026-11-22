import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerCreateCommentTool(app: AgentApp): void {
  app.tool('create-comment', {
    description: 'Create a comment on a file.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'ID of the file to comment on',
        },
        content: {
          type: 'string',
          description: 'The text content of the comment',
        },
      },
      required: ['fileId', 'content'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { fileId, content } = args as { fileId: string; content: string };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.drive.comments.create({
            fileId,
            fields: 'id, content, author, createdTime',
            requestBody: {
              content,
            },
          });

          return response.data;
        },
        'create-comment',
      );
    },
  });
}
