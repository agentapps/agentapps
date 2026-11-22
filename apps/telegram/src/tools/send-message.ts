/**
 * send-message — send a text message to a Telegram chat.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerSendMessageTool(app: AgentApp): void {
  app.tool('send-message', {
    description:
      'Send a text message to a Telegram chat. Supports HTML, Markdown, and MarkdownV2 formatting.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description:
            'Unique identifier for the target chat or username of the target channel (e.g. @channelusername).',
        },
        text: {
          type: 'string',
          description: 'Text of the message to be sent.',
        },
        parseMode: {
          type: 'string',
          enum: ['HTML', 'Markdown', 'MarkdownV2'],
          description: 'Mode for parsing entities in the message text.',
        },
        disableNotification: {
          type: 'boolean',
          description:
            'Sends the message silently. Users will receive a notification with no sound.',
        },
        replyToMessageId: {
          type: 'number',
          description: 'If the message is a reply, ID of the original message.',
        },
      },
      required: ['chatId', 'text'],
    },
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
        text: args.text,
      };
      if (args.parseMode) params.parse_mode = args.parseMode;
      if (args.disableNotification !== undefined)
        params.disable_notification = args.disableNotification;
      if (args.replyToMessageId !== undefined) params.reply_to_message_id = args.replyToMessageId;

      return await telegramRequest('sendMessage', params, ctx);
    },
  });
}
