import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface SetChannelPurposeArgs {
  channelId: string;
  purpose: string;
}

export function registerSetChannelPurposeTool(app: AgentApp): void {
  app.tool('set-channel-purpose', {
    description:
      'Set the purpose of a channel (long-form description shown in details). Max 250 chars. Returns { channelId, purpose }. Not retryable. Params: channelId, purpose.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Channel id.' },
        purpose: { type: 'string', description: 'Channel purpose (≤250 chars).' },
      },
      required: ['channelId', 'purpose'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { channelId, purpose } = args as unknown as SetChannelPurposeArgs;
      validateChannelId(channelId, 'channelId');
      if (typeof purpose !== 'string') {
        throw new Error('purpose must be a string.');
      }
      if (purpose.length > 250) {
        throw new Error(`purpose too long (max 250 chars, got ${purpose.length}).`);
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.conversations.setPurpose({ channel: channelId, purpose }),
      );
      return {
        channelId,
        purpose: (result as any).purpose ?? purpose,
      };
    },
  });
}
