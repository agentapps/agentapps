import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractChannel, validateChannelId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface ArchiveChannelArgs {
  channelId: string;
}

export function registerArchiveChannelTool(app: AgentApp): void {
  app.tool('archive-channel', {
    description:
      'Archive a channel (read-only afterwards). Returns { id, name } from a follow-up info call. Not retryable. Params: channelId.',
    parameters: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          description: 'Slack channel id (C... / G...).',
        },
      },
      required: ['channelId'],
    },
    annotations: { sensitive: true, readOnlyHint: false, destructiveHint: true },
    handler: async (args, ctx) => {
      const { channelId } = args as unknown as ArchiveChannelArgs;
      validateChannelId(channelId, 'channelId');
      const { botClient: client } = await getSlackSession(ctx);
      await wrapSlackMutation(() => client.conversations.archive({ channel: channelId }));
      // conversations.archive returns no channel object; fetch a minimal shape so
      // the renderer can show the resolved name without a second LLM call.
      let resolved: any = null;
      try {
        const info = await client.conversations.info({ channel: channelId });
        resolved = info.channel ?? null;
      } catch {
        // ignore — channel may be archived and inaccessible to the bot
      }
      return resolved ? extractChannel(resolved) : { id: channelId, name: '', isArchived: true };
    },
  });
}
