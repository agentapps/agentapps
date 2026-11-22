import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerGetSceneTool(app: AgentApp): void {
  app.tool('get-scene', {
    description:
      'Get detailed metadata for a specific Excalidraw scene by its ID, including links and sharing settings.',
    parameters: {
      type: 'object',
      properties: {
        sceneId: {
          type: 'string',
          description: 'The scene ID to retrieve.',
        },
      },
      required: ['sceneId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      return client.getScene(args.sceneId as string);
    },
  });
}
