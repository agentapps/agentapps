import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient } from '../lib/index.js';

/**
 * delete-folder — DELETE /me/mailFolders/{folderId}.
 */
export function registerDeleteFolderTool(app: AgentApp): void {
  app.tool('delete-folder', {
    description: 'Delete a mail folder and all its contents.',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'The ID of the folder to delete' },
      },
      required: ['folderId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const folderId = (args as Record<string, unknown>).folderId as string;
      await graphRequest('DELETE', `/me/mailFolders/${folderId}`);

      return { success: true, account: email, folderId };
    },
  });
}
