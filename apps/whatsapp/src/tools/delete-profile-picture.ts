import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerDeleteProfilePictureTool(app: AgentApp): void {
  app.tool('delete-profile-picture', {
    description: 'Delete the profile picture of the current WhatsApp account.',
    parameters: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'Session name (default: "default")',
        },
      },
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args, ctx) => {
      const { session = 'default' } = (args ?? {}) as { session?: string };
      const res = await wahaFetch(ctx, `/${session}/profile/picture`, {
        method: 'DELETE',
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
