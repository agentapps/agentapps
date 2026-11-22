import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient } from '../lib/index.js';

/**
 * list-folders — GET /me/mailFolders.
 */
export function registerListFoldersTool(app: AgentApp): void {
  app.tool('list-folders', {
    description: 'List all mail folders in the account.',
    parameters: {
      type: 'object',
      properties: {
        includeChildFolders: {
          type: 'boolean',
          description: 'Whether to include child folders (default: false)',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const response = await graphRequest(
        'GET',
        '/me/mailFolders?$select=id,displayName,parentFolderId,totalItemCount,unreadItemCount,isHidden',
      );

      let folders = response.value || [];

      if (a.includeChildFolders) {
        const withChildren = await Promise.all(
          folders.map(async (folder: any) => {
            const childResponse = await graphRequest(
              'GET',
              `/me/mailFolders/${folder.id}/childFolders?$select=id,displayName,parentFolderId,totalItemCount,unreadItemCount`,
            );
            return { ...folder, childFolders: childResponse.value || [] };
          }),
        );
        folders = withChildren;
      }

      return { account: email, count: folders.length, folders };
    },
  });
}
