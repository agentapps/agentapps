import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerUpdateSceneContentTool(app: AgentApp): void {
  app.tool('update-scene-content', {
    description:
      'Replace the complete drawing content of an Excalidraw scene with new elements. WARNING: this is a full replace — existing content is overwritten. Pass the full array of elements you want the scene to contain.',
    parameters: {
      type: 'object',
      properties: {
        sceneId: {
          type: 'string',
          description: 'The scene ID to update.',
        },
        elements: {
          type: 'array',
          description:
            'Array of Excalidraw element objects (shapes, text, arrows, etc.). This replaces all existing elements.',
          items: { type: 'object' },
        },
        appState: {
          type: 'object',
          description: 'Optional Excalidraw app state (viewport, theme, etc.).',
        },
        files: {
          type: 'object',
          description: 'Optional embedded files map (e.g. images referenced in the scene).',
        },
      },
      required: ['sceneId', 'elements'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      return client.updateSceneContent(args.sceneId as string, {
        elements: args.elements as unknown[],
        appState: args.appState as Record<string, unknown> | undefined,
        files: args.files as Record<string, unknown> | undefined,
      });
    },
  });
}
