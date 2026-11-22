import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerCreateCollectionSceneTool(app: AgentApp): void {
  app.tool('create-collection-scene', {
    description:
      'Create a new scene directly inside a specific Excalidraw collection. Equivalent to create-scene but scoped to the collection.',
    parameters: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'The collection ID to create the scene in.',
        },
        name: {
          type: 'string',
          description: 'Name for the new scene.',
        },
        pinned: {
          type: 'boolean',
          description: 'Whether to pin the scene (default: false).',
        },
      },
      required: ['collectionId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      return client.createCollectionScene(args.collectionId as string, {
        name: args.name as string,
        pinned: (args.pinned as boolean | undefined) ?? false,
      });
    },
  });
}
