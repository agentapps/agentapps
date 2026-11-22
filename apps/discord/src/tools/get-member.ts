import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerGetMemberTool(app: AgentApp): void {
  app.tool('get-member', {
    description: 'Get a specific guild member by user ID.',
    parameters: {
      type: 'object',
      properties: {
        guildId: { type: 'string', description: 'The ID of the guild' },
        userId: { type: 'string', description: 'The ID of the user' },
      },
      required: ['guildId', 'userId'],
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
        const member = (await rest.get(
          Routes.guildMember((args as any).guildId, (args as any).userId),
        )) as Record<string, unknown>;
        return {
          user: member.user
            ? {
                id: (member.user as any).id,
                username: (member.user as any).username,
                global_name: (member.user as any).global_name,
                avatar: (member.user as any).avatar,
                bot: (member.user as any).bot,
              }
            : null,
          nick: member.nick,
          roles: member.roles,
          joined_at: member.joined_at,
          premium_since: member.premium_since,
          deaf: member.deaf,
          mute: member.mute,
          flags: member.flags,
          pending: member.pending,
          communication_disabled_until: member.communication_disabled_until,
        };
      } catch (error) {
        handleDiscordError(error, 'get member');
      }
    },
  });
}
