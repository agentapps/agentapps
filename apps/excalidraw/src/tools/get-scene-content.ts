import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerGetSceneContentTool(app: AgentApp): void {
  app.tool('get-scene-content', {
    description:
      'Retrieve the complete drawing content of an Excalidraw scene: all elements (shapes, text, arrows, etc.), app state, and embedded files.',
    parameters: {
      type: 'object',
      properties: {
        sceneId: {
          type: 'string',
          description: 'The scene ID whose content to retrieve.',
        },
      },
      required: ['sceneId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      return client.getSceneContent(args.sceneId as string);
    },
  });
}
