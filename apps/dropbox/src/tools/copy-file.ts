import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerCopyFileTool(app: AgentApp): void {
  app.tool('copy-file', {
    description: 'Copy a file or folder in Dropbox to a new location.',
    parameters: {
      type: 'object',
      properties: {
        from_path: {
          type: 'string',
          description: 'The path of the file or folder to copy.',
        },
        to_path: {
          type: 'string',
          description: 'The destination path for the copy.',
        },
      },
      required: ['from_path', 'to_path'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { from_path, to_path } = args as {
        from_path: string;
        to_path: string;
      };

      const result = await dropboxRequest(
        'files/copy_v2',
        {
          from_path,
          to_path,
        },
        ctx,
      );

      return result;
    },
  });
}
