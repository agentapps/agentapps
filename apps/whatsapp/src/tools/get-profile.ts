import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerGetProfileTool(app: AgentApp): void {
  app.tool('get-profile', {
    description:
      'Get the profile of the current WhatsApp account (name, picture URL, status/About text, etc.).',
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
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      // WAHA is a separate process reached over HTTP.
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { session = 'default' } = (args ?? {}) as { session?: string };
      const res = await wahaFetch(ctx, `/${session}/profile`);
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
