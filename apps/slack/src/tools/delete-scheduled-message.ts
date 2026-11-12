import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface DeleteScheduledMessageArgs {
  channel: string;
  scheduledMessageId: string;
  asUser?: boolean;
}

export function registerDeleteScheduledMessageTool(app: AgentApp): void {
  app.tool('delete-scheduled-message', {
    description:
      'Cancel a scheduled message. Returns { channel, scheduledMessageId, deleted: true }. Not retryable. Params: channel, scheduledMessageId, asUser? (def true).',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id where the message was scheduled.' },
        scheduledMessageId: {
          type: 'string',
          description: 'Id returned by chat.scheduleMessage / list-scheduled-messages.',
        },
        asUser: {
          type: 'boolean',
          description: 'Delete as the authenticated user (default true).',
        },
      },
      required: ['channel', 'scheduledMessageId'],
    },
    annotations: { sensitive: true, readOnlyHint: false, destructiveHint: true },
    handler: async (args, ctx) => {
      const { channel, scheduledMessageId, asUser } = args as unknown as DeleteScheduledMessageArgs;
      validateChannelId(channel, 'channel');
      if (typeof scheduledMessageId !== 'string' || scheduledMessageId.trim().length === 0) {
        throw new Error('scheduledMessageId must be a non-empty string.');
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        client.chat.deleteScheduledMessage({
          channel,
          scheduled_message_id: scheduledMessageId,
          as_user: asUser ?? true,
        }),
      );
      return { channel, scheduledMessageId, deleted: true };
    },
  });
}
