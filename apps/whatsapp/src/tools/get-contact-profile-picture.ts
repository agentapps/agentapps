import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerGetContactProfilePictureTool(app: AgentApp): void {
  app.tool('get-contact-profile-picture', {
    description: 'Get the profile picture URL of a WhatsApp contact.',
    parameters: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'Session name (default: "default")',
        },
        contactId: {
          type: 'string',
          description: 'Contact chat ID (e.g. 34612345678@c.us)',
        },
        refresh: {
          type: 'boolean',
          description: 'Force a refresh of the cached picture (optional)',
        },
      },
      required: ['contactId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const {
        session = 'default',
        contactId,
        refresh,
      } = args as {
        session?: string;
        contactId: string;
        refresh?: boolean;
      };
      const params = new URLSearchParams({ contactId, session });
      if (refresh !== undefined) params.set('refresh', String(refresh));
      const res = await wahaFetch(ctx, `/contacts/profile-picture?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          status: res.status,
          error: `WAHA returned HTTP ${res.status}`,
          detail: err,
        };
      }
      return await res.json();
    },
  });
}
