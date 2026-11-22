import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerBanMemberTool(app: AgentApp): void {
  app.tool('ban-member', {
    description:
      'Ban a member from a guild. Optionally delete their message history. Requires Ban Members permission.',
    parameters: {
      type: 'object',
      properties: {
        guildId: { type: 'string', description: 'The ID of the guild' },
        userId: { type: 'string', description: 'The ID of the user to ban' },
        deleteMessageSeconds: {
          type: 'number',
          description: 'Number of seconds of messages to delete (0-604800, i.e. up to 7 days)',
          default: 0,
        },
        reason: { type: 'string', description: 'Reason for banning the member (for audit log)' },
      },
      required: ['guildId', 'userId'],
    },
    // Destructive: the app has no unban, and the ban can delete the member's recent messages.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const body: Record<string, unknown> = {
          delete_message_seconds: Math.min((args as any).deleteMessageSeconds ?? 0, 604800),
        };
        const headers: Record<string, string> = {};
        if ((args as any).reason) headers['X-Audit-Log-Reason'] = (args as any).reason;
        await rest.put(Routes.guildBan((args as any).guildId, (args as any).userId), {
          body,
          headers,
        });
        return {
          success: true,
          message: `User ${(args as any).userId} banned from guild ${(args as any).guildId}`,
          deleteMessageSeconds: (args as any).deleteMessageSeconds ?? 0,
          reason: (args as any).reason,
        };
      } catch (error) {
        handleDiscordError(error, 'ban member');
      }
    },
  });
}
