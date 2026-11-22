import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerCreateWebhookTool(app: AgentApp): void {
  app.tool('create-webhook', {
    description:
      'Create a new webhook in a channel. Requires Manage Webhooks permission. Returns the webhook token for sending messages.',
    parameters: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          description: 'The ID of the channel to create the webhook in',
        },
        name: { type: 'string', description: 'The name of the webhook' },
        avatar: { type: 'string', description: 'Base64-encoded image data for the webhook avatar' },
        reason: { type: 'string', description: 'Reason for creating the webhook (for audit log)' },
      },
      required: ['channelId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const body: Record<string, unknown> = { name: (args as any).name };
        if ((args as any).avatar) body.avatar = (args as any).avatar;
        const headers: Record<string, string> = {};
        if ((args as any).reason) headers['X-Audit-Log-Reason'] = (args as any).reason;
        const webhook = (await rest.post(Routes.channelWebhooks((args as any).channelId), {
          body,
          headers,
        })) as Record<string, unknown>;
        return {
          id: webhook.id,
          type: webhook.type,
          guild_id: webhook.guild_id,
          channel_id: webhook.channel_id,
          name: webhook.name,
          avatar: webhook.avatar,
          token: webhook.token,
          url: `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`,
        };
      } catch (error) {
        handleDiscordError(error, 'create webhook');
      }
    },
  });
}
