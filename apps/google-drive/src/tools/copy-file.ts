import type { AgentApp } from '@agentapps/sdk';
import {
  ALL_DRIVES,
  ensureAuthenticated,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';

export function registerCopyFileTool(app: AgentApp): void {
  app.tool('copy-file', {
    description: 'Create a copy of a file in Google Drive.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'ID of the file to copy',
        },
        name: {
          type: 'string',
          description: 'Optional: Name for the copy',
        },
        parentFolderId: {
          type: 'string',
          description: 'Optional: Copy to specific folder',
        },
      },
      required: ['fileId'],
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

      const { fileId, name, parentFolderId } = args as {
        fileId: string;
        name?: string;
        parentFolderId?: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const fileMetadata: { name?: string; parents?: string[] } = {};

          if (name) {
            fileMetadata.name = name;
          }

          if (parentFolderId) {
            fileMetadata.parents = [parentFolderId];
          }

          const response = await clients.drive.files.copy({
            ...ALL_DRIVES,
            fileId,
            requestBody: fileMetadata,
            fields: 'id, name, webViewLink',
          });

          return response.data;
        },
        'copy-file',
      );
    },
  });
}
