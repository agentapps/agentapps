import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerDeleteCollectionTool(app: AgentApp): void {
  app.tool('delete-collection', {
    description:
      'Soft-delete an Excalidraw collection by moving it to trash. Scenes inside the collection are not deleted.',
    parameters: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'The collection ID to delete.',
        },
      },
      required: ['collectionId'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      await client.deleteCollection(args.collectionId as string);
      return {
        success: true,
        collectionId: args.collectionId,
        message: 'Collection moved to trash.',
      };
    },
  });
}
