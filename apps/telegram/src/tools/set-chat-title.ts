/**
 * set_chat_title — change the title of a Telegram chat.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerSetChatTitleTool(app: AgentApp): void {
  app.tool('set_chat_title', {
    description:
      'Change the title of a Telegram group, supergroup, or channel. The bot must be an administrator with the appropriate permissions.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description: 'Unique identifier for the target chat or username of the target channel.',
        },
        title: {
          type: 'string',
          description: 'New chat title, 1-128 characters.',
        },
      },
      required: ['chatId', 'title'],
    },
    // Setting the title again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      return await telegramRequest(
        'setChatTitle',
        {
          chat_id: args.chatId,
          title: args.title,
        },
        ctx,
      );
    },
  });
}
