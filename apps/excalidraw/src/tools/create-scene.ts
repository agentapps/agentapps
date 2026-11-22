import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerCreateSceneTool(app: AgentApp): void {
  app.tool('create-scene', {
    description:
      'Create a new empty Excalidraw scene with specified metadata. Optionally assign it to a collection and pin it. Returns the created scene with its ID and sharing links.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the new scene.',
        },
        collectionId: {
          type: 'string',
          description: 'ID of the collection to place the scene in.',
        },
        pinned: {
          type: 'boolean',
          description: 'Whether to pin the scene (default: false).',
        },
      },
      required: ['name', 'collectionId'],
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
      return client.createScene({
        name: args.name as string,
        collectionId: args.collectionId as string,
        pinned: (args.pinned as boolean | undefined) ?? false,
      });
    },
  });
}
