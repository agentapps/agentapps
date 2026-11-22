import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient } from '../lib/index.js';

/**
 * create-folder — POST /me/mailFolders or /me/mailFolders/{parentId}/childFolders.
 */
export function registerCreateFolderTool(app: AgentApp): void {
  app.tool('create-folder', {
    description: 'Create a new mail folder.',
    parameters: {
      type: 'object',
      properties: {
        displayName: { type: 'string', description: 'Name for the new folder' },
        parentFolderId: {
          type: 'string',
          description: 'Parent folder ID (optional, creates at top level if omitted)',
        },
      },
      required: ['displayName'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = args as Record<string, unknown>;
      const displayName = a.displayName as string;
      const parentFolderId = a.parentFolderId as string | undefined;

      const path = parentFolderId
        ? `/me/mailFolders/${parentFolderId}/childFolders`
        : '/me/mailFolders';

      const folder = await graphRequest('POST', path, { displayName });

      return {
        success: true,
        account: email,
        folderId: folder.id,
        displayName: folder.displayName,
      };
    },
  });
}
