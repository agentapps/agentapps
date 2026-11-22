import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerListUsersTool(app: AgentApp): void {
  app.tool('list-users', {
    description: 'List all users in the Excalidraw Plus workspace with their roles and metadata.',
    parameters: {
      type: 'object',
      properties: {
        cursor: {
          type: 'string',
          description: 'Pagination cursor from a previous response.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of users to return (default: 50).',
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
      return client.listUsers(args.cursor as string | undefined, args.limit as number | undefined);
    },
  });
}
