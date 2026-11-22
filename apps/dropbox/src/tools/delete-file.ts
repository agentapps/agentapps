import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerDeleteFileTool(app: AgentApp): void {
  app.tool('delete-file', {
    description: 'Delete a file or folder from Dropbox.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path of the file or folder to delete (e.g. "/Documents/old-file.txt").',
        },
      },
      required: ['path'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { path } = args as { path: string };

      const result = await dropboxRequest('files/delete_v2', { path }, ctx);

      return result;
    },
  });
}
