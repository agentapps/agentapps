import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerGetChannelTool(app: AgentApp): void {
  app.tool('get-channel', {
    description: 'Get detailed information about a specific channel by ID.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'The ID of the channel to retrieve' },
      },
      required: ['channelId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const channel = (await rest.get(Routes.channel((args as any).channelId))) as Record<
          string,
          unknown
        >;
        return {
          id: channel.id,
          type: channel.type,
          name: channel.name,
          guild_id: channel.guild_id,
          position: channel.position,
          parent_id: channel.parent_id,
          nsfw: channel.nsfw,
          topic: channel.topic,
          bitrate: channel.bitrate,
          user_limit: channel.user_limit,
          rate_limit_per_user: channel.rate_limit_per_user,
          last_message_id: channel.last_message_id,
          permission_overwrites: channel.permission_overwrites,
          recipients: channel.recipients,
        };
      } catch (error) {
        handleDiscordError(error, 'get channel');
      }
    },
  });
}
