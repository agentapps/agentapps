import type { AgentApp } from '@agentapps/sdk';
import {
  ALL_DRIVES,
  ensureAuthenticated,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';

export function registerMoveFileTool(app: AgentApp): void {
  app.tool('move-file', {
    description: 'Move a file or folder to a different location in Google Drive.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'ID of the file/folder to move',
        },
        newParentId: {
          type: 'string',
          description: 'ID of the destination folder',
        },
      },
      required: ['fileId', 'newParentId'],
    },
    // Moving the file back undoes it.
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

      const { fileId, newParentId } = args as { fileId: string; newParentId: string };

      return withAuthRetry(
        ctx,
        async () => {
          const file = await clients.drive.files.get({
            ...ALL_DRIVES,
            fileId,
            fields: 'parents',
          });

          const previousParents = file.data.parents?.join(',');

          const response = await clients.drive.files.update({
            ...ALL_DRIVES,
            fileId,
            addParents: newParentId,
            removeParents: previousParents,
            fields: 'id, name, parents, webViewLink',
          });

          return response.data;
        },
        'move-file',
      );
    },
  });
}
