import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerSessionStatusTool(app: AgentApp): void {
  app.tool('session-status', {
    description:
      'Get the status of a WhatsApp session. Status can be: WORKING, SCAN_QR_CODE, STARTING, STOPPED, FAILED. SCAN_QR_CODE means the session is waiting to be linked — use request-pairing-code (authentication is always done with a pairing code, never QR).',
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
      const res = await wahaFetch(ctx, `/sessions/${session}`);
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
