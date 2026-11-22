import type { AgentApp } from '@agentapps/sdk';
import {
  ALL_DRIVES,
  ensureAuthenticated,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';

export function registerGetFileTool(app: AgentApp): void {
  app.tool('get-file', {
    description: 'Get detailed information about a specific file or folder.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'The ID of the file or folder to get information about',
        },
      },
      required: ['fileId'],
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

      const { fileId } = args as { fileId: string };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.drive.files.get({
            ...ALL_DRIVES,
            fileId,
            fields:
              'id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink, description, owners, driveId',
          });

          return response.data;
        },
        'get-file',
      );
    },
  });
}
