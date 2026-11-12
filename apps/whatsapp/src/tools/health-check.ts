import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerHealthCheckTool(app: AgentApp): void {
  app.tool('health-check', {
    description:
      'Internal health check tool. Verifies WAHA connectivity and lists active sessions.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (_args, ctx) => {
      const res = await wahaFetch(ctx, '/sessions');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          status: res.status,
          error: `WAHA returned HTTP ${res.status}`,
          detail: err,
        };
      }
      const sessions = await res.json();
      return { status: 'ok', sessions };
    },
  });
}
