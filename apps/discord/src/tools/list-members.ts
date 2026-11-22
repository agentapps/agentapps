import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerListMembersTool(app: AgentApp): void {
  app.tool('list-members', {
    description: 'List members of a guild. Supports pagination via limit and after user ID.',
    parameters: {
      type: 'object',
      properties: {
        guildId: { type: 'string', description: 'The ID of the guild' },
        limit: {
          type: 'number',
          description: 'Maximum number of members to return (1-1000)',
          default: 100,
        },
        after: { type: 'string', description: 'Get members after this user ID' },
      },
      required: ['guildId'],
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
        const params = new URLSearchParams();
        if ((args as any).limit) params.set('limit', String(Math.min((args as any).limit, 1000)));
        if ((args as any).after) params.set('after', (args as any).after);
        const qs = params.toString();
        const path = qs
          ? `${Routes.guildMembers((args as any).guildId as `/${string}`)}?${qs}`
          : Routes.guildMembers((args as any).guildId as `/${string}`);
        const members = (await rest.get(path as `/${string}`)) as Array<Record<string, unknown>>;
        return {
          members: members.map((m) => ({
            user: m.user
              ? {
                  id: (m.user as any).id,
                  username: (m.user as any).username,
                  global_name: (m.user as any).global_name,
                  avatar: (m.user as any).avatar,
                  bot: (m.user as any).bot,
                }
              : null,
            nick: m.nick,
            roles: m.roles,
            joined_at: m.joined_at,
            premium_since: m.premium_since,
            deaf: m.deaf,
            mute: m.mute,
            flags: m.flags,
            pending: m.pending,
            communication_disabled_until: m.communication_disabled_until,
          })),
          total: members.length,
        };
      } catch (error) {
        handleDiscordError(error, 'list members');
      }
    },
  });
}
