import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerSaveUrlTool(app: AgentApp): void {
  app.tool('save-url', {
    description:
      'Save a URL to a file in Dropbox. Downloads the content from the URL and saves it at the specified path.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'The Dropbox path where the file should be saved (e.g. "/Downloads/file.pdf").',
        },
        url: {
          type: 'string',
          description: 'The URL to download and save to Dropbox.',
        },
      },
      required: ['path', 'url'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { path, url } = args as { path: string; url: string };

      const result = await dropboxRequest('files/save_url', { path, url }, ctx);

      return result;
    },
  });
}
