import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractChannel, validateChannelId, validateUserId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface InviteToChannelArgs {
  channelId: string;
  userIds: string[];
}

export function registerInviteToChannelTool(app: AgentApp): void {
  app.tool('invite-to-channel', {
    description:
      'Invite users to a channel. Returns { channel, invitedUserIds, alreadyInChannel? }. Not retryable. Params: channelId, userIds[].',
    parameters: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          description: 'Slack channel id (C... / G...).',
        },
        userIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Slack user ids (U... / W...) to invite.',
        },
      },
      required: ['channelId', 'userIds'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      const { channelId, userIds } = args as unknown as InviteToChannelArgs;
      validateChannelId(channelId, 'channelId');
      if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new Error('userIds must be a non-empty array of Slack user ids.');
      }
      for (const [i, id] of userIds.entries()) validateUserId(id, `userIds[${i}]`);

      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.conversations.invite({ channel: channelId, users: userIds.join(',') }),
      );
      return {
        channel: result.channel ? extractChannel(result.channel) : { id: channelId },
        invitedUserIds: userIds,
        alreadyInChannel: (result as any).errors?.length ? (result as any).errors : undefined,
      };
    },
  });
}
