import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerGetWorkspaceTool(app: AgentApp): void {
  app.tool('get-workspace', {
    description:
      "Retrieve the current Excalidraw Plus workspace's metadata, including name, users, and invites.",
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      return client.getWorkspace();
    },
  });
}
