import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface LeaveChannelArgs {
  channelId: string;
}

export function registerLeaveChannelTool(app: AgentApp): void {
  app.tool('leave-channel', {
    description:
      'Leave a public or private channel. Returns { channelId, notInChannel }. Not retryable. Params: channelId.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Slack channel id (C... / G...).' },
      },
      required: ['channelId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { channelId } = args as unknown as LeaveChannelArgs;
      validateChannelId(channelId, 'channelId');
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.conversations.leave({ channel: channelId }),
      );
      return {
        channelId,
        notInChannel: (result as any).not_in_channel ?? false,
      };
    },
  });
}
