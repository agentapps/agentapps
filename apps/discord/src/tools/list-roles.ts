import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerListRolesTool(app: AgentApp): void {
  app.tool('list-roles', {
    description: 'List all roles in a guild, ordered by position (highest first).',
    parameters: {
      type: 'object',
      properties: {
        guildId: { type: 'string', description: 'The ID of the guild' },
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
        const roles = (await rest.get(Routes.guildRoles((args as any).guildId))) as Array<
          Record<string, unknown>
        >;
        return {
          roles: roles.map((r) => ({
            id: r.id,
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            icon: r.icon,
            unicode_emoji: r.unicode_emoji,
            position: r.position,
            permissions: r.permissions,
            managed: r.managed,
            mentionable: r.mentionable,
            tags: r.tags,
            flags: r.flags,
          })),
          total: roles.length,
        };
      } catch (error) {
        handleDiscordError(error, 'list roles');
      }
    },
  });
}
