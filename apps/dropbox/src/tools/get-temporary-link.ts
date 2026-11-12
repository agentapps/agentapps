import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerGetTemporaryLinkTool(app: AgentApp): void {
  app.tool('get-temporary-link', {
    description:
      'Get a temporary download link for a file in Dropbox. The link expires after 4 hours.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'The path of the file to get a temporary link for (e.g. "/Documents/report.pdf").',
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

      const result = await dropboxRequest('files/get_temporary_link', { path }, ctx);

      return result;
    },
  });
}
