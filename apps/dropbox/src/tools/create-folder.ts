import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerCreateFolderTool(app: AgentApp): void {
  app.tool('create-folder', {
    description: 'Create a new folder in Dropbox.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path of the folder to create (e.g. "/Documents/New Folder").',
        },
        autorename: {
          type: 'boolean',
          description:
            'If true and a folder with the same name exists, the new folder will be auto-renamed (default: false).',
        },
      },
      required: ['path'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { path, autorename = false } = args as {
        path: string;
        autorename?: boolean;
      };

      const result = await dropboxRequest(
        'files/create_folder_v2',
        {
          path,
          autorename,
        },
        ctx,
      );

      return result;
    },
  });
}
