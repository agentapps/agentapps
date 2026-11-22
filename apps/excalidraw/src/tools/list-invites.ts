import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerListInvitesTool(app: AgentApp): void {
  app.tool('list-invites', {
    description: 'List all pending and active invites for the Excalidraw Plus workspace.',
    parameters: {
      type: 'object',
      properties: {
        cursor: {
          type: 'string',
          description: 'Pagination cursor from a previous response.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of invites to return (default: 50).',
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
      return client.listInvites(
        args.cursor as string | undefined,
        args.limit as number | undefined,
      );
    },
  });
}
