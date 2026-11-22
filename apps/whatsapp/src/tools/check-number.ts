import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerCheckNumberTool(app: AgentApp): void {
  app.tool('check-number', {
    description: 'Check if a phone number has WhatsApp and get its chat ID.',
    parameters: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'Session name (default: "default")',
        },
        phone: {
          type: 'string',
          description: 'Phone number with country code (e.g. 34612345678)',
        },
      },
      required: ['phone'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { session = 'default', phone } = args as {
        session?: string;
        phone: string;
      };
      const params = new URLSearchParams({ phone, session });
      const res = await wahaFetch(ctx, `/contacts/check-exists?${params}`);
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
