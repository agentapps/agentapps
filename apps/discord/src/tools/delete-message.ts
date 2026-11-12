import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerDeleteMessageTool(app: AgentApp): void {
  app.tool('delete-message', {
    description:
      'Delete a message from a channel. Requires Manage Messages permission if not the message author.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'The ID of the channel containing the message' },
        messageId: { type: 'string', description: 'The ID of the message to delete' },
        reason: { type: 'string', description: 'Reason for deleting the message (for audit log)' },
      },
      required: ['channelId', 'messageId'],
    },
    annotations: { sensitive: true, readOnlyHint: false, irreversible: true },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const headers: Record<string, string> = {};
        if ((args as any).reason) headers['X-Audit-Log-Reason'] = (args as any).reason;
        await rest.delete(Routes.channelMessage((args as any).channelId, (args as any).messageId), {
          headers,
        });
        return {
          success: true,
          message: `Message ${(args as any).messageId} deleted from channel ${(args as any).channelId}`,
        };
      } catch (error) {
        handleDiscordError(error, 'delete message');
      }
    },
  });
}
