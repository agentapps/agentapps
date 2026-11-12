/**
 * send_location — send a geographic location to a Telegram chat.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerSendLocationTool(app: AgentApp): void {
  app.tool('send_location', {
    description: 'Send a geographic location (latitude and longitude) to a Telegram chat.',
    parameters: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          description: 'Unique identifier for the target chat or username of the target channel.',
        },
        latitude: {
          type: 'number',
          description: 'Latitude of the location.',
        },
        longitude: {
          type: 'number',
          description: 'Longitude of the location.',
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
      required: ['chatId', 'latitude', 'longitude'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        chat_id: args.chatId,
        latitude: args.latitude,
        longitude: args.longitude,
      };
      if (args.disableNotification !== undefined)
        params.disable_notification = args.disableNotification;
      if (args.replyToMessageId !== undefined) params.reply_to_message_id = args.replyToMessageId;

      return await telegramRequest('sendLocation', params, ctx);
    },
  });
}
