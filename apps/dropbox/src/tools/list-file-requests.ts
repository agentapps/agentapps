import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerListFileRequestsTool(app: AgentApp): void {
  app.tool('list-file-requests', {
    description: 'List all file requests for the authenticated Dropbox account.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of file requests to return (default: 1000).',
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
      const { limit = 1000 } = args as { limit?: number };

      const result = await dropboxRequest('file_requests/list_v2', { limit }, ctx);

      return result;
    },
  });
}
