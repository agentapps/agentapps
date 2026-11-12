import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerGetCollectionScenesTool(app: AgentApp): void {
  app.tool('get-collection-scenes', {
    description: 'List all scenes that belong to a specific Excalidraw collection.',
    parameters: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'The collection ID to list scenes from.',
        },
      },
      required: ['collectionId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      return client.getCollectionScenes(args.collectionId as string);
    },
  });
}
