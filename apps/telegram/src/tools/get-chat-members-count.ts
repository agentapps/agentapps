/**
 * get_chat_members_count — get the number of members in a Telegram chat.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerGetChatMembersCountTool(app: AgentApp): void {
  app.tool('get_chat_members_count', {
    description: 'Get the number of members in a Telegram chat.',
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const result = await telegramRequest('getChatMemberCount', { chat_id: args.chatId }, ctx);
      return { chatId: args.chatId, memberCount: result };
    },
  });
}
