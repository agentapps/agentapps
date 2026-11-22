/**
 * edit_message — edit the text of a message sent by the bot.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerEditMessageTool(app: AgentApp): void {
  app.tool('edit_message', {
    description:
      'Edit the text of a message previously sent by the bot. Supports HTML, Markdown, and MarkdownV2 formatting.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description: 'Unique identifier for the target chat or username of the target channel.',
        },
        messageId: {
          type: 'number',
          description: 'Identifier of the message to edit.',
        },
        text: {
          type: 'string',
          description: 'New text of the message.',
        },
        parseMode: {
          type: 'string',
          enum: ['HTML', 'Markdown', 'MarkdownV2'],
          description: 'Mode for parsing entities in the message text.',
        },
      },
      required: ['chatId', 'messageId', 'text'],
    },
    // Setting the text again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        chat_id: args.chatId,
        message_id: args.messageId,
        text: args.text,
      };
      if (args.parseMode) params.parse_mode = args.parseMode;

      return await telegramRequest('editMessageText', params, ctx);
    },
  });
}
