import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerStopSessionTool(app: AgentApp): void {
  app.tool('stop-session', {
    description:
      'Stop a WhatsApp session without deleting it. The session can be restarted later with start-session.',
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
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args, ctx) => {
      const { session = 'default' } = (args ?? {}) as { session?: string };
      const res = await wahaFetch(ctx, `/sessions/${session}/stop`, {
        method: 'POST',
      });
      if (res.status === 200 || res.status === 204) return { success: true, session };
      const data = await res.json().catch(() => ({}));
      return { success: false, status: res.status, ...data };
    },
  });
}
