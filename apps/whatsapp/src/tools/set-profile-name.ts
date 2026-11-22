import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerSetProfileNameTool(app: AgentApp): void {
  app.tool('set-profile-name', {
    description: 'Change the display name of the current WhatsApp profile.',
    parameters: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'Session name (default: "default")',
        },
        name: {
          type: 'string',
          description: 'New display name to set',
        },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      // Setting the previous name again undoes it.
      destructiveHint: false,
      idempotentHint: true,
      // WAHA is a separate process reached over HTTP.
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { session = 'default', name } = args as {
        session?: string;
        name: string;
      };
      const res = await wahaFetch(ctx, `/${session}/profile/name`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
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
