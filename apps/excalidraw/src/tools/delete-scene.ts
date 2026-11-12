import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerDeleteSceneTool(app: AgentApp): void {
  app.tool('delete-scene', {
    description:
      'Soft-delete an Excalidraw scene by moving it to trash. The scene can be recovered from the Excalidraw Plus UI.',
    parameters: {
      type: 'object',
      properties: {
        sceneId: {
          type: 'string',
          description: 'The scene ID to delete.',
        },
      },
      required: ['sceneId'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      await client.deleteScene(args.sceneId as string);
      return { success: true, sceneId: args.sceneId, message: 'Scene moved to trash.' };
    },
  });
}
