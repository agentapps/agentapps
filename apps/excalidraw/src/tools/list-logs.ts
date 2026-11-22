import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerListLogsTool(app: AgentApp): void {
  app.tool('list-logs', {
    description:
      'Retrieve workspace audit logs from Excalidraw Plus. Useful for tracking activity, changes, and access history.',
    parameters: {
      type: 'object',
      properties: {
        cursor: {
          type: 'string',
          description: 'Pagination cursor from a previous response.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of log entries to return (default: 50).',
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
      return client.listLogs(args.cursor as string | undefined, args.limit as number | undefined);
    },
  });
}
