import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerSetProfilePictureTool(app: AgentApp): void {
  app.tool('set-profile-picture', {
    description: 'Set the profile picture of the current WhatsApp account from a public image URL.',
    parameters: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'Session name (default: "default")',
        },
        url: {
          type: 'string',
          description: 'Public HTTPS URL of the image to use as profile picture',
        },
      },
      required: ['url'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { session = 'default', url } = args as {
        session?: string;
        url: string;
      };
      const res = await wahaFetch(ctx, `/${session}/profile/picture`, {
        method: 'PUT',
        body: JSON.stringify({ file: { url } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          status: res.status,
          error: `WAHA returned HTTP ${res.status}`,
          detail: err,
        };
      }
      if (res.status === 204) return { success: true };
      return await res.json().catch(() => ({ success: true }));
    },
  });
}
