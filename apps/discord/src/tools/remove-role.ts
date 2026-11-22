import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerRemoveRoleTool(app: AgentApp): void {
  app.tool('remove-role', {
    description: 'Remove a role from a guild member. Requires Manage Roles permission.',
    parameters: {
      type: 'object',
      properties: {
        guildId: { type: 'string', description: 'The ID of the guild' },
        userId: { type: 'string', description: 'The ID of the user' },
        roleId: { type: 'string', description: 'The ID of the role to remove' },
        reason: { type: 'string', description: 'Reason for removing the role (for audit log)' },
      },
      required: ['guildId', 'userId', 'roleId'],
    },
    // Not destructive: assign-role gives the role back.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const headers: Record<string, string> = {};
        if ((args as any).reason) headers['X-Audit-Log-Reason'] = (args as any).reason;
        await rest.delete(
          Routes.guildMemberRole((args as any).guildId, (args as any).userId, (args as any).roleId),
          { headers },
        );
        return {
          success: true,
          message: `Role ${(args as any).roleId} removed from user ${(args as any).userId}`,
        };
      } catch (error) {
        handleDiscordError(error, 'remove role');
      }
    },
  });
}
