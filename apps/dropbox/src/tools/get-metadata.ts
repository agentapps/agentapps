import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerGetMetadataTool(app: AgentApp): void {
  app.tool('get-metadata', {
    description: 'Get metadata for a file or folder in Dropbox (size, modified date, path, etc.).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file or folder (e.g. "/Documents/report.pdf").',
        },
      },
      required: ['path'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { path } = args as { path: string };

      const result = await dropboxRequest('files/get_metadata', { path }, ctx);

      return result;
    },
  });
}
