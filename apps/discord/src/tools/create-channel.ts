import type { AgentApp } from '@agentapps/sdk';
import { ChannelType, Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerCreateChannelTool(app: AgentApp): void {
  app.tool('create-channel', {
    description:
      'Create a new channel in a guild. Supports text, voice, category, announcement, and forum channels.',
    parameters: {
      type: 'object',
      properties: {
        guildId: { type: 'string', description: 'The ID of the guild' },
        name: { type: 'string', description: 'The name of the channel' },
        type: {
          type: 'string',
          description: 'The type of channel to create',
          enum: ['text', 'voice', 'category', 'announcement', 'forum', 'stage'],
          default: 'text',
        },
        topic: { type: 'string', description: 'The channel topic (for text channels)' },
        parentId: { type: 'string', description: 'The ID of the parent category' },
        nsfw: { type: 'boolean', description: 'Whether the channel is NSFW', default: false },
        rateLimitPerUser: {
          type: 'number',
          description: 'Slowmode rate limit in seconds (0-21600)',
          default: 0,
        },
        bitrate: { type: 'number', description: 'Bitrate for voice channels (8000-96000)' },
        userLimit: {
          type: 'number',
          description: 'User limit for voice channels (0 = unlimited)',
          default: 0,
        },
        position: { type: 'number', description: 'Sorting position of the channel' },
      },
      required: ['guildId', 'name'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const typeMap: Record<string, number> = {
          text: ChannelType.GuildText,
          voice: ChannelType.GuildVoice,
          category: ChannelType.GuildCategory,
          announcement: ChannelType.GuildAnnouncement,
          forum: ChannelType.GuildForum,
          stage: ChannelType.GuildStageVoice,
        };
        const body: Record<string, unknown> = {
          name: (args as any).name,
          type: typeMap[(args as any).type] ?? ChannelType.GuildText,
          nsfw: (args as any).nsfw,
        };
        if ((args as any).topic) body.topic = (args as any).topic;
        if ((args as any).parentId) body.parent_id = (args as any).parentId;
        if ((args as any).rateLimitPerUser !== undefined)
          body.rate_limit_per_user = (args as any).rateLimitPerUser;
        if ((args as any).bitrate) body.bitrate = (args as any).bitrate;
        if ((args as any).userLimit !== undefined) body.user_limit = (args as any).userLimit;
        if ((args as any).position !== undefined) body.position = (args as any).position;
        const channel = (await rest.post(Routes.guildChannels((args as any).guildId), {
          body,
        })) as Record<string, unknown>;
        return {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          guild_id: channel.guild_id,
          parent_id: channel.parent_id,
          nsfw: channel.nsfw,
          topic: channel.topic,
          rate_limit_per_user: channel.rate_limit_per_user,
          bitrate: channel.bitrate,
          user_limit: channel.user_limit,
          position: channel.position,
        };
      } catch (error) {
        handleDiscordError(error, 'create channel');
      }
    },
  });
}
