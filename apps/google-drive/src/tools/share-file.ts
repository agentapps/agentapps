import type { AgentApp } from '@agentapps/sdk';
import {
  ALL_DRIVES,
  ensureAuthenticated,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';

export function registerShareFileTool(app: AgentApp): void {
  app.tool('share-file', {
    description: 'Share a file or folder with specific permissions.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'The ID of the file or folder to share',
        },
        emailAddress: {
          type: 'string',
          description: 'Email address to share with',
        },
        role: {
          type: 'string',
          enum: ['reader', 'commenter', 'writer', 'owner'],
          description: 'Permission role (default: reader)',
        },
      },
      required: ['fileId', 'emailAddress'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const {
        fileId,
        emailAddress,
        role = 'reader',
      } = args as {
        fileId: string;
        emailAddress: string;
        role?: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.drive.permissions.create({
            ...ALL_DRIVES,
            fileId,
            requestBody: {
              type: 'user',
              role,
              emailAddress,
            },
            fields: 'id, type, role, emailAddress, displayName',
          });

          return response.data;
        },
        'share-file',
      );
    },
  });
}
