import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId, validateMessageTs } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface MarkChannelReadArgs {
  channelId: string;
  timestamp: string;
}

export function registerMarkChannelReadTool(app: AgentApp): void {
  app.tool('mark-channel-read', {
    description:
      'Mark all messages in a channel up to and including `timestamp` as read for the authed user. Returns { channelId, timestamp, marked: true }. Idempotent. Params: channelId, timestamp.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Channel id.' },
        timestamp: {
          type: 'string',
          description: 'Message ts as the read cursor ("1234567890.123456").',
        },
      },
      required: ['channelId', 'timestamp'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { channelId, timestamp } = args as unknown as MarkChannelReadArgs;
      validateChannelId(channelId, 'channelId');
      validateMessageTs(timestamp, 'timestamp');
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        client.conversations.mark({ channel: channelId, ts: timestamp }),
      );
      return { channelId, timestamp, marked: true };
    },
  });
}
