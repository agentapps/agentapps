import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerListFolderContinueTool(app: AgentApp): void {
  app.tool('list-folder-continue', {
    description:
      'Continue listing files and folders from a previous list-folder call. Use the cursor returned by list-folder when has_more is true.',
    parameters: {
      type: 'object',
      properties: {
        cursor: {
          type: 'string',
          description:
            'The cursor returned by the previous list-folder or list-folder-continue call.',
        },
      },
      required: ['cursor'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { cursor } = args as { cursor: string };

      const result = await dropboxRequest('files/list_folder/continue', { cursor }, ctx);

      return result;
    },
  });
}
