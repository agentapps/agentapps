/**
 * delete_message — delete a message from a Telegram chat.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerDeleteMessageTool(app: AgentApp): void {
  app.tool('delete_message', {
    description:
      'Delete a message from a Telegram chat. The bot must have the appropriate permissions. Messages can only be deleted within 48 hours of sending.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description: 'Unique identifier for the target chat or username of the target channel.',
        },
        messageId: {
          type: 'number',
          description: 'Identifier of the message to delete.',
        },
      },
      required: ['chatId', 'messageId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      return await telegramRequest(
        'deleteMessage',
        {
          chat_id: args.chatId,
          message_id: args.messageId,
        },
        ctx,
      );
    },
  });
}
