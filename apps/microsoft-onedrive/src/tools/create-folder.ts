import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatItem, parentRef } from '../lib/index.js';

/** create-folder — POST {parentRef}/children with a folder facet. */
export function registerCreateFolderTool(app: AgentApp): void {
  app.tool('create-folder', {
    description:
      'Create a new folder in OneDrive. Address the containing folder with parentId or parentPath; with neither, the folder is created at the drive root.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the new folder' },
        parentId: {
          type: 'string',
          description:
            'ID of the folder to create the new folder inside. Takes precedence over parentPath. Defaults to the drive root.',
        },
        parentPath: {
          type: 'string',
          description:
            'Path of the folder to create the new folder inside, relative to the drive root, e.g. "Documents/Reports". Pass literal folder names, not pre-encoded ones. Defaults to the drive root.',
        },
        itemId: { type: 'string', description: 'Deprecated alias for parentId.' },
        path: { type: 'string', description: 'Deprecated alias for parentPath.' },
        conflictBehavior: {
          type: 'string',
          description: 'What to do if the name exists: "rename" (default), "replace", or "fail".',
        },
      },
      required: ['name'],
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

      const a = (args ?? {}) as Record<string, unknown>;
      const name = a.name as string;
      const conflictBehavior = (a.conflictBehavior as string) || 'rename';

      const created = await graphRequest<Record<string, any>>('POST', `${parentRef(a)}/children`, {
        name,
        folder: {},
        '@microsoft.graph.conflictBehavior': conflictBehavior,
      });

      return { success: true, account: email, item: formatItem(created) };
    },
  });
}
