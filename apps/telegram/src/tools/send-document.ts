/**
 * send_document — send a document to a Telegram chat.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerSendDocumentTool(app: AgentApp): void {
  app.tool('send_document', {
    description:
      'Send a document to a Telegram chat. The document can be a URL or a file_id of an already uploaded file.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description: 'Unique identifier for the target chat or username of the target channel.',
        },
        document: {
          type: 'string',
          description:
            'Document to send. Pass a URL or file_id of an existing file on Telegram servers.',
        },
        caption: {
          type: 'string',
          description: 'Document caption (0-1024 characters).',
        },
      },
      required: ['chatId', 'document'],
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
        document: args.document,
      };
      if (args.caption) params.caption = args.caption;

      return await telegramRequest('sendDocument', params, ctx);
    },
  });
}
