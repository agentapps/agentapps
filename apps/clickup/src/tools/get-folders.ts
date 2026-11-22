import type { AgentApp } from '@agentapps/sdk';
import { clickupRequest } from '../lib/clickup-client.js';

export function registerGetFoldersTool(app: AgentApp): void {
  app.tool('get-folders', {
    description: 'Get all folders in a ClickUp space.',
    parameters: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'The space ID' },
        archived: { type: 'boolean', description: 'Include archived folders (default: false)' },
      },
      required: ['spaceId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { spaceId, archived = false } = args as { spaceId: string; archived?: boolean };
      const data = (await clickupRequest(ctx, `/space/${spaceId}/folder`, {
        params: { archived: String(archived) },
      })) as { folders: any[] };
      return {
        spaceId,
        folders: data.folders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          orderIndex: folder.orderindex,
          taskCount: folder.task_count,
          archived: folder.archived,
          lists: folder.lists?.map((l: any) => ({
            id: l.id,
            name: l.name,
            taskCount: l.task_count,
          })),
        })),
      };
    },
  });
}
