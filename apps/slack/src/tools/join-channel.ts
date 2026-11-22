import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractChannel, validateChannelId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface JoinChannelArgs {
  channelId: string;
}

export function registerJoinChannelTool(app: AgentApp): void {
  app.tool('join-channel', {
    description:
      'Join a public channel. Returns the curated channel. Idempotent (already_in_channel raises BUSINESS_RULE). Params: channelId.',
    parameters: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          description: 'Slack channel id (C...).',
        },
      },
      required: ['channelId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { channelId } = args as unknown as JoinChannelArgs;
      validateChannelId(channelId, 'channelId');
      const { botClient: client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.conversations.join({ channel: channelId }),
      );
      return result.channel ? extractChannel(result.channel) : { id: channelId };
    },
  });
}
