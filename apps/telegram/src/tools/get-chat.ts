/**
 * get_chat — get information about a Telegram chat.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerGetChatTool(app: AgentApp): void {
  app.tool('get_chat', {
    description:
      'Get up-to-date information about a Telegram chat (group, supergroup, or channel).',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description:
            'Unique identifier for the target chat or username of the target supergroup or channel.',
        },
      },
      required: ['chatId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      return await telegramRequest('getChat', { chat_id: args.chatId }, ctx);
    },
  });
}
