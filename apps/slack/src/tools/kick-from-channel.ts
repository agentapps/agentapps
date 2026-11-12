import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId, validateUserId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface KickFromChannelArgs {
  channelId: string;
  userId: string;
}

export function registerKickFromChannelTool(app: AgentApp): void {
  app.tool('kick-from-channel', {
    description:
      'Remove a user from a channel. Requires admin or channel owner permissions. Returns { channelId, userId, kicked: true }. Not retryable. Params: channelId, userId.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Channel id.' },
        userId: { type: 'string', description: 'User id (U... / W...) to remove.' },
      },
      required: ['channelId', 'userId'],
    },
    annotations: { sensitive: true, readOnlyHint: false, destructiveHint: true },
    handler: async (args, ctx) => {
      const { channelId, userId } = args as unknown as KickFromChannelArgs;
      validateChannelId(channelId, 'channelId');
      validateUserId(userId, 'userId');
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        client.conversations.kick({ channel: channelId, user: userId }),
      );
      return { channelId, userId, kicked: true };
    },
  });
}
