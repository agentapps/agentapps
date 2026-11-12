import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerCreateCollectionTool(app: AgentApp): void {
  app.tool('create-collection', {
    description:
      'Create a new collection (folder) in the Excalidraw Plus workspace to group related scenes.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the new collection.',
        },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      return client.createCollection({ name: args.name as string });
    },
  });
}
