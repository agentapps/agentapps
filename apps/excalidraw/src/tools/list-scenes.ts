import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerListScenesTool(app: AgentApp): void {
  app.tool('list-scenes', {
    description:
      'List all Excalidraw scenes in the workspace with their metadata and links. Supports pagination via cursor.',
    parameters: {
      type: 'object',
      properties: {
        cursor: {
          type: 'string',
          description: 'Pagination cursor from a previous response to get the next page.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of scenes to return per page (default: 50).',
        },
      },
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
      return client.listScenes(args.cursor as string | undefined, args.limit as number | undefined);
    },
  });
}
