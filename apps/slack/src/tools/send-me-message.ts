import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface SendMeMessageArgs {
  channel: string;
  text: string;
}

export function registerSendMeMessageTool(app: AgentApp): void {
  app.tool('send-me-message', {
    description:
      'Send a /me action message (third-person italic in Slack UI). Returns { ts, channel }. Not retryable. Params: channel, text.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id.' },
        text: { type: 'string', description: 'Action text (e.g. "is testing the feature").' },
      },
      required: ['channel', 'text'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      const { channel, text } = args as unknown as SendMeMessageArgs;
      validateChannelId(channel, 'channel');
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('text must be a non-empty string.');
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() => client.chat.meMessage({ channel, text }));
      return {
        ts: result.ts ?? '',
        channel: result.channel ?? channel,
      };
    },
  });
}
