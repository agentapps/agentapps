import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerGetChatLabelsTool(app: AgentApp): void {
  app.tool('get-chat-labels', {
    description:
      'Get all labels assigned to a specific WhatsApp chat. Returns an array of label objects with id, name, color, and colorHex. Only available in WhatsApp Business accounts.',
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
            'Chat ID (e.g. 34612345678@c.us for individuals, 120363XXXXXX@g.us for groups)',
        },
      },
      required: ['chatId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args, ctx) => {
      const { session = 'default', chatId } = args as {
        session?: string;
        chatId: string;
      };
      const res = await wahaFetch(ctx, `/${session}/labels/chats/${chatId}/`);
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
