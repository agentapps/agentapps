import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractChannel, validateChannelId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface UnarchiveChannelArgs {
  channelId: string;
}

export function registerUnarchiveChannelTool(app: AgentApp): void {
  app.tool('unarchive-channel', {
    description:
      'Unarchive a previously archived channel. Returns curated channel. Not retryable. Params: channelId.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Channel id (C... / G...).' },
      },
      required: ['channelId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { channelId } = args as unknown as UnarchiveChannelArgs;
      validateChannelId(channelId, 'channelId');
      const { botClient: client } = await getSlackSession(ctx);
      await wrapSlackMutation(() => client.conversations.unarchive({ channel: channelId }));
      // unarchive returns ok only; fetch the resolved name for the renderer
      let resolved: any = null;
      try {
        const info = await client.conversations.info({ channel: channelId });
        resolved = info.channel ?? null;
      } catch {
        // ignore
      }
      return resolved
        ? extractChannel(resolved)
        : {
            id: channelId,
            name: '',
            isPrivate: false,
            isArchived: false,
            isMember: false,
            numMembers: null,
            topic: '',
            purpose: '',
            created: null,
            creator: null,
          };
    },
  });
}
