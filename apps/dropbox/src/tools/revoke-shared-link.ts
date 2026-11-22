import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerRevokeSharedLinkTool(app: AgentApp): void {
  app.tool('revoke-shared-link', {
    description: 'Revoke a shared link for a file or folder in Dropbox.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the shared link to revoke.',
        },
      },
      required: ['url'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { url } = args as { url: string };

      await dropboxRequest('sharing/revoke_shared_link', { url }, ctx);

      return { success: true, message: `Shared link revoked: ${url}` };
    },
  });
}
