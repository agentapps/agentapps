import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerSendTextTool(app: AgentApp): void {
  app.tool('send-text', {
    description: 'Send a WhatsApp text message to a phone number or group.',
    parameters: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'Session name (default: "default")',
        },
        chatId: {
          type: 'string',
          description:
            'Recipient in format: 34612345678@c.us (individual) or 120363XXXXXX@g.us (group)',
        },
        text: {
          type: 'string',
          description: 'Message text to send',
        },
      },
      required: ['chatId', 'text'],
    },
    annotations: {
      readOnlyHint: false,
      // A sent message cannot be taken back through the app.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const {
        session = 'default',
        chatId,
        text,
      } = args as {
        session?: string;
        chatId: string;
        text: string;
      };
      const res = await wahaFetch(ctx, '/sendText', {
        method: 'POST',
        body: JSON.stringify({ session, chatId, text }),
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
      return await res.json();
    },
  });
}
