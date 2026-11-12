/**
 * get_chat_member — get information about a member of a chat.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerGetChatMemberTool(app: AgentApp): void {
  app.tool('get_chat_member', {
    description:
      'Get information about a member of a Telegram chat — status, permissions, and user details.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description:
            'Unique identifier for the target chat or username of the target supergroup or channel.',
        },
        userId: {
          type: 'number',
          description: 'Unique identifier of the target user.',
        },
      },
      required: ['chatId', 'userId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      return await telegramRequest(
        'getChatMember',
        {
          chat_id: args.chatId,
          user_id: args.userId,
        },
        ctx,
      );
    },
  });
}
