/**
 * forward_message — forward a message from one chat to another.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerForwardMessageTool(app: AgentApp): void {
  app.tool('forward_message', {
    description: 'Forward a message from one Telegram chat to another.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description: 'Unique identifier for the target chat to forward the message to.',
        },
        fromChatId: {
          type: 'string',
          description: 'Unique identifier for the chat where the original message was sent.',
        },
        messageId: {
          type: 'number',
          description: 'Message identifier in the chat specified in fromChatId.',
        },
        disableNotification: {
          type: 'boolean',
          description:
            'Sends the message silently. Users will receive a notification with no sound.',
        },
      },
      required: ['chatId', 'fromChatId', 'messageId'],
    },
    // Forwarding sends a message to other people: a send cannot be taken back.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        chat_id: args.chatId,
        from_chat_id: args.fromChatId,
        message_id: args.messageId,
      };
      if (args.disableNotification !== undefined)
        params.disable_notification = args.disableNotification;

      return await telegramRequest('forwardMessage', params, ctx);
    },
  });
}
