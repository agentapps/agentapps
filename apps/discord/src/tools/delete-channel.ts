import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerDeleteChannelTool(app: AgentApp): void {
  app.tool('delete-channel', {
    description:
      'Delete a channel or close a DM. Requires Manage Channels permission for guild channels.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'The ID of the channel to delete' },
        reason: { type: 'string', description: 'Reason for deleting the channel (for audit log)' },
      },
      required: ['channelId'],
    },
    annotations: { sensitive: true, readOnlyHint: false, irreversible: true },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const headers: Record<string, string> = {};
        if ((args as any).reason) headers['X-Audit-Log-Reason'] = (args as any).reason;
        const channel = (await rest.delete(Routes.channel((args as any).channelId), {
          headers,
        })) as Record<string, unknown>;
        return {
          success: true,
          id: channel.id,
          name: channel.name,
          type: channel.type,
          message: 'Channel deleted successfully',
        };
      } catch (error) {
        handleDiscordError(error, 'delete channel');
      }
    },
  });
}
