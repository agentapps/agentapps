import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerKickMemberTool(app: AgentApp): void {
  app.tool('kick-member', {
    description: 'Kick a member from a guild. Requires Kick Members permission.',
    parameters: {
      type: 'object',
      properties: {
        guildId: { type: 'string', description: 'The ID of the guild' },
        userId: { type: 'string', description: 'The ID of the user to kick' },
        reason: { type: 'string', description: 'Reason for kicking the member (for audit log)' },
      },
      required: ['guildId', 'userId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const headers: Record<string, string> = {};
        if ((args as any).reason) headers['X-Audit-Log-Reason'] = (args as any).reason;
        await rest.delete(Routes.guildMember((args as any).guildId, (args as any).userId), {
          headers,
        });
        return {
          success: true,
          message: `User ${(args as any).userId} kicked from guild ${(args as any).guildId}`,
          reason: (args as any).reason,
        };
      } catch (error) {
        handleDiscordError(error, 'kick member');
      }
    },
  });
}
