import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface SetChannelTopicArgs {
  channelId: string;
  topic: string;
}

export function registerSetChannelTopicTool(app: AgentApp): void {
  app.tool('set-channel-topic', {
    description:
      'Set the topic of a channel (short description in the channel header). Max 250 chars. Returns { channelId, topic }. Not retryable. Params: channelId, topic.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Channel id.' },
        topic: { type: 'string', description: 'Channel topic (≤250 chars).' },
      },
      required: ['channelId', 'topic'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { channelId, topic } = args as unknown as SetChannelTopicArgs;
      validateChannelId(channelId, 'channelId');
      if (typeof topic !== 'string') {
        throw new Error('topic must be a string.');
      }
      if (topic.length > 250) {
        throw new Error(`topic too long (max 250 chars, got ${topic.length}).`);
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.conversations.setTopic({ channel: channelId, topic }),
      );
      return {
        channelId,
        topic: (result as any).topic ?? topic,
      };
    },
  });
}
