import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerListWebhooksTool(app: AgentApp): void {
  app.tool('list-webhooks', {
    description: 'List webhooks in a guild or channel. Requires Manage Webhooks permission.',
    parameters: {
      type: 'object',
      properties: {
        guildId: { type: 'string', description: 'The ID of the guild (list all guild webhooks)' },
        channelId: { type: 'string', description: 'The ID of the channel (list channel webhooks)' },
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
        let webhooks: Array<Record<string, unknown>>;
        if ((args as any).channelId) {
          webhooks = (await rest.get(Routes.channelWebhooks((args as any).channelId))) as Array<
            Record<string, unknown>
          >;
        } else if ((args as any).guildId) {
          webhooks = (await rest.get(Routes.guildWebhooks((args as any).guildId))) as Array<
            Record<string, unknown>
          >;
        } else {
          throw new Error('Either guildId or channelId is required');
        }
        return {
          webhooks: webhooks.map((w) => ({
            id: w.id,
            type: w.type,
            guild_id: w.guild_id,
            channel_id: w.channel_id,
            name: w.name,
            avatar: w.avatar,
            token: w.token,
            application_id: w.application_id,
            user: w.user
              ? {
                  id: (w.user as any).id,
                  username: (w.user as any).username,
                  global_name: (w.user as any).global_name,
                }
              : null,
          })),
          total: webhooks.length,
        };
      } catch (error) {
        handleDiscordError(error, 'list webhooks');
      }
    },
  });
}
