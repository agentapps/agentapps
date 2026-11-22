import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerGetCollectionTool(app: AgentApp): void {
  app.tool('get-collection', {
    description: 'Get detailed information about a specific Excalidraw collection by its ID.',
    parameters: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'The collection ID to retrieve.',
        },
      },
      required: ['collectionId'],
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
      return client.getCollection(args.collectionId as string);
    },
  });
}
