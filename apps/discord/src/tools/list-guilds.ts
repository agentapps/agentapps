import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerListGuildsTool(app: AgentApp): void {
  app.tool('list-guilds', {
    description: 'List guilds (servers) the bot/user is a member of. Supports pagination.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of guilds to return (default 100)',
          default: 100,
        },
        before: { type: 'string', description: 'Get guilds before this guild ID' },
        after: { type: 'string', description: 'Get guilds after this guild ID' },
        withCounts: {
          type: 'boolean',
          description: 'Include approximate member and presence counts',
          default: false,
        },
      },
      required: [],
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
        if ((args as any).limit) params.set('limit', String((args as any).limit));
        if ((args as any).before) params.set('before', (args as any).before);
        if ((args as any).after) params.set('after', (args as any).after);
        if ((args as any).withCounts) params.set('with_counts', 'true');
        const qs = params.toString();
        const basePath = Routes.userGuilds() as `/${string}`;
        const path = qs ? `${basePath}?${qs}` : basePath;
        const guilds = (await rest.get(path as `/${string}`)) as Array<Record<string, unknown>>;
        return {
          guilds: guilds.map((g) => ({
            id: g.id,
            name: g.name,
            icon: g.icon,
            owner: g.owner,
            permissions: g.permissions,
            approximate_member_count: g.approximate_member_count,
            approximate_presence_count: g.approximate_presence_count,
          })),
          total: guilds.length,
        };
      } catch (error) {
        handleDiscordError(error, 'list guilds');
      }
    },
  });
}
