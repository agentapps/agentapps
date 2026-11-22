import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerReadMessagesTool(app: AgentApp): void {
  app.tool('read-messages', {
    description:
      'Mark messages in a WhatsApp chat as read. If no message IDs are provided, marks all messages in the chat as read.',
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
        messages: {
          type: 'array',
          description:
            'Optional list of message IDs to mark as read. If omitted, all messages in the chat are marked as read.',
          items: { type: 'string' },
        },
        days: {
          type: 'number',
          description: 'Optional number of days back to mark messages as read.',
        },
      },
      required: ['chatId'],
    },
    annotations: {
      readOnlyHint: false,
      // Sends read receipts to the other person; they cannot be taken back.
      destructiveHint: true,
      idempotentHint: true,
      // WAHA is a separate process reached over HTTP.
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const {
        session = 'default',
        chatId,
        messages,
        days,
      } = args as {
        session?: string;
        chatId: string;
        messages?: string[];
        days?: number;
      };
      const encodedChatId = encodeURIComponent(chatId);
      const body: { messages?: string[]; days?: number } = {};
      if (messages !== undefined) body.messages = messages;
      if (days !== undefined) body.days = days;
      const res = await wahaFetch(ctx, `/${session}/chats/${encodedChatId}/messages/read`, {
        method: 'POST',
        body: JSON.stringify(body),
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
