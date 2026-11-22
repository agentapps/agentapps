/**
 * pin-message — pin a message in a Telegram chat.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerPinMessageTool(app: AgentApp): void {
  app.tool('pin-message', {
    description:
      'Pin a message in a Telegram group, supergroup, or channel. The bot must be an administrator with the appropriate permissions.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description: 'Unique identifier for the target chat or username of the target channel.',
        },
        messageId: {
          type: 'number',
          description: 'Identifier of the message to pin.',
        },
        disableNotification: {
          type: 'boolean',
          description:
            'Pass true to disable notification for all chat members about the pinned message.',
        },
      },
      required: ['chatId', 'messageId'],
    },
    // Pinning marks a message and deletes nothing, so it is not destructive, although this
    // app has no unpin tool and members are notified unless disableNotification is set.
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
      };
      if (args.disableNotification !== undefined)
        params.disable_notification = args.disableNotification;

      return await telegramRequest('pinChatMessage', params, ctx);
    },
  });
}
