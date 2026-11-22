import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerCreateSharedLinkTool(app: AgentApp): void {
  app.tool('create-shared-link', {
    description:
      'Create a shared link for a file or folder in Dropbox. Returns a URL that can be shared with others.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path of the file or folder to share.',
        },
        settings: {
          type: 'object',
          description: 'Optional sharing settings.',
          properties: {
            requested_visibility: {
              type: 'string',
              description: 'Visibility of the shared link: "public", "team_only", or "password".',
              enum: ['public', 'team_only', 'password'],
            },
            link_password: {
              type: 'string',
              description: 'Password for the link (only if requested_visibility is "password").',
            },
            expires: {
              type: 'string',
              description: 'Expiration date in ISO 8601 format (e.g. "2025-12-31T23:59:59Z").',
            },
          },
        },
      },
      required: ['path'],
    },
    // Exposes the file through a URL, but revoke-shared-link takes it back.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { path, settings } = args as {
        path: string;
        settings?: {
          requested_visibility?: string;
          link_password?: string;
          expires?: string;
        };
      };

      const body: Record<string, unknown> = { path };
      if (settings) {
        body.settings = settings;
      }

      const result = await dropboxRequest('sharing/create_shared_link_with_settings', body, ctx);

      return result;
    },
  });
}
