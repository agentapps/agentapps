import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerListFolderTool(app: AgentApp): void {
  app.tool('list-folder', {
    description:
      'List files and folders in a Dropbox folder. Returns metadata entries for each item.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'The path to the folder (e.g. "/Documents"). Use empty string "" for the root folder.',
        },
        recursive: {
          type: 'boolean',
          description: 'If true, list contents of all sub-folders recursively (default: false).',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of entries to return (default: 100, max: 2000).',
        },
      },
      required: ['path'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const {
        path,
        recursive = false,
        limit = 100,
      } = args as {
        path: string;
        recursive?: boolean;
        limit?: number;
      };

      const result = await dropboxRequest(
        'files/list_folder',
        {
          path: path || '',
          recursive,
          limit,
        },
        ctx,
      );

      return result;
    },
  });
}
