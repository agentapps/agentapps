import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerListCollectionsTool(app: AgentApp): void {
  app.tool('list-collections', {
    description:
      'List all collections in the Excalidraw Plus workspace. Collections are folders that group related scenes together.',
    parameters: {
      type: 'object',
      properties: {
        cursor: {
          type: 'string',
          description: 'Pagination cursor from a previous response.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of collections to return (default: 50).',
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
      return client.listCollections(
        args.cursor as string | undefined,
        args.limit as number | undefined,
      );
    },
  });
}
