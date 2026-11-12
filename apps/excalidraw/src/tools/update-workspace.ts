import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerUpdateWorkspaceTool(app: AgentApp): void {
  app.tool('update-workspace', {
    description: "Update the current Excalidraw Plus workspace's metadata (e.g. rename it).",
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'New name for the workspace.',
        },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      return client.updateWorkspace({ name: args.name as string });
    },
  });
}
