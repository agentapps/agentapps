/**
 * send-photo — send a photo to a Telegram chat.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerSendPhotoTool(app: AgentApp): void {
  app.tool('send-photo', {
    description:
      'Send a photo to a Telegram chat. The photo can be a URL or a file_id of an already uploaded photo.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description: 'Unique identifier for the target chat or username of the target channel.',
        },
        photo: {
          type: 'string',
          description:
            'Photo to send. Pass a URL or file_id of an existing photo on Telegram servers.',
        },
        caption: {
          type: 'string',
          description: 'Photo caption (0-1024 characters).',
        },
        parseMode: {
          type: 'string',
          enum: ['HTML', 'Markdown', 'MarkdownV2'],
          description: 'Mode for parsing entities in the caption.',
        },
      },
      required: ['chatId', 'photo'],
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
        photo: args.photo,
      };
      if (args.caption) params.caption = args.caption;
      if (args.parseMode) params.parse_mode = args.parseMode;

      return await telegramRequest('sendPhoto', params, ctx);
    },
  });
}
