import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerUpdateSceneTool(app: AgentApp): void {
  app.tool('update-scene', {
    description:
      'Update the metadata of an existing Excalidraw scene (name, pinned status, collection assignment).',
    parameters: {
      type: 'object',
      properties: {
        sceneId: {
          type: 'string',
          description: 'The scene ID to update.',
        },
        name: {
          type: 'string',
          description: 'New name for the scene.',
        },
        pinned: {
          type: 'boolean',
          description: 'Whether to pin the scene.',
        },
        collectionId: {
          type: 'string',
          description: 'Move the scene to a different collection by providing its ID.',
        },
      },
      required: ['sceneId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      const payload: { name?: string; pinned?: boolean; collectionId?: string } = {};
      if (args.name !== undefined) payload.name = args.name as string;
      if (args.pinned !== undefined) payload.pinned = args.pinned as boolean;
      if (args.collectionId !== undefined) payload.collectionId = args.collectionId as string;
      return client.updateScene(args.sceneId as string, payload);
    },
  });
}
