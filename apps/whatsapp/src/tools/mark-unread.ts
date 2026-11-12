import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerMarkUnreadTool(app: AgentApp): void {
  app.tool('mark-unread', {
    description: 'Mark a WhatsApp chat as unread (shows the blue dot indicator).',
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
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args, ctx) => {
      const { session = 'default', chatId } = args as {
        session?: string;
        chatId: string;
      };
      const encodedChatId = encodeURIComponent(chatId);
      const res = await wahaFetch(ctx, `/${session}/chats/${encodedChatId}/unread`, {
        method: 'POST',
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
      const data = await res.json().catch(() => ({}));
      return { success: true, chatId, ...data };
    },
  });
}
