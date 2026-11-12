import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerMoveFileTool(app: AgentApp): void {
  app.tool('move-file', {
    description: 'Move a file or folder in Dropbox to a new location.',
    parameters: {
      type: 'object',
      properties: {
        from_path: {
          type: 'string',
          description: 'The current path of the file or folder.',
        },
        to_path: {
          type: 'string',
          description: 'The new path for the file or folder.',
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
        'files/move_v2',
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
