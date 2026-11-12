import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerListSharedLinksTool(app: AgentApp): void {
  app.tool('list-shared-links', {
    description:
      'List shared links for a file or folder in Dropbox, or list all shared links if no path is given.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'The path to the file or folder. If omitted, lists all shared links for the account.',
        },
        direct_only: {
          type: 'boolean',
          description:
            'If true, only return direct links to the given path. If false, may return links to parent folders (default: false).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { path, direct_only } = args as {
        path?: string;
        direct_only?: boolean;
      };

      const body: Record<string, unknown> = {};
      if (path !== undefined) {
        body.path = path;
      }
      if (direct_only !== undefined) {
        body.direct_only = direct_only;
      }

      const result = await dropboxRequest('sharing/list_shared_links', body, ctx);

      return result;
    },
  });
}
