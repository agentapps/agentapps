import type { AgentApp } from '@agentapps/sdk';
import {
  ALL_DRIVES,
  ensureAuthenticated,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';

export function registerDeleteFileTool(app: AgentApp): void {
  app.tool('delete-file', {
    description: 'Delete a file or folder from Google Drive.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'The ID of the file or folder to delete',
        },
      },
      required: ['fileId'],
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

      const { fileId } = args as { fileId: string };

      return withAuthRetry(
        ctx,
        async () => {
          await clients.drive.files.delete({ ...ALL_DRIVES, fileId });

          return {
            success: true,
            message: `File/folder ${fileId} deleted successfully`,
          };
        },
        'delete-file',
      );
    },
  });
}
