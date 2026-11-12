import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerListCommentsTool(app: AgentApp): void {
  app.tool('list-comments', {
    description: 'List all comments on a file.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'ID of the file',
        },
        includeDeleted: {
          type: 'boolean',
          description: 'Optional: Include deleted comments (default: false)',
        },
        pageSize: {
          type: 'number',
          description: 'Optional: Maximum number of comments to return (default: 100)',
        },
      },
      required: ['fileId'],
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
        includeDeleted = false,
        pageSize = 100,
      } = args as {
        fileId: string;
        includeDeleted?: boolean;
        pageSize?: number;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.drive.comments.list({
            fileId,
            includeDeleted,
            pageSize,
            fields: 'comments(id, content, author, createdTime, modifiedTime, resolved, replies)',
          });

          return {
            comments: response.data.comments || [],
          };
        },
        'list-comments',
      );
    },
  });
}
