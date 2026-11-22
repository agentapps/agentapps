import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerUpdateCollectionTool(app: AgentApp): void {
  app.tool('update-collection', {
    description: 'Update the metadata of an existing Excalidraw collection (e.g. rename it).',
    parameters: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'The collection ID to update.',
        },
        name: {
          type: 'string',
          description: 'New name for the collection.',
        },
      },
      required: ['collectionId', 'name'],
    },
    // A rename: setting the name again undoes it.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      return client.updateCollection(args.collectionId as string, { name: args.name as string });
    },
  });
}
