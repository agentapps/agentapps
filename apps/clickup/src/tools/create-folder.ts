import type { AgentApp } from '@agentapps/sdk';
import { clickupRequest } from '../lib/clickup-client.js';

export function registerCreateFolderTool(app: AgentApp): void {
  app.tool('create-folder', {
    description: 'Create a new folder in a ClickUp space.',
    parameters: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'The space ID where the folder will be created' },
        name: { type: 'string', description: 'Name of the new folder' },
      },
      required: ['spaceId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
    },
    handler: async (args, ctx) => {
      const { spaceId, name } = args as { spaceId: string; name: string };
      const data = (await clickupRequest(ctx, `/space/${spaceId}/folder`, {
        method: 'POST',
        body: { name },
      })) as any;
      return {
        id: data.id,
        name: data.name,
        spaceId: data.space?.id,
        orderIndex: data.orderindex,
      };
    },
  });
}
