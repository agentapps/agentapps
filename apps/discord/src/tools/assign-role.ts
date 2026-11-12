import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerAssignRoleTool(app: AgentApp): void {
  app.tool('assign-role', {
    description:
      "Add a role to a guild member. Requires Manage Roles permission with the bot's role above the target role.",
    parameters: {
      type: 'object',
      properties: {
        guildId: { type: 'string', description: 'The ID of the guild' },
        userId: { type: 'string', description: 'The ID of the user' },
        roleId: { type: 'string', description: 'The ID of the role to assign' },
        reason: { type: 'string', description: 'Reason for assigning the role (for audit log)' },
      },
      required: ['guildId', 'userId', 'roleId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const headers: Record<string, string> = {};
        if ((args as any).reason) headers['X-Audit-Log-Reason'] = (args as any).reason;
        await rest.put(
          Routes.guildMemberRole((args as any).guildId, (args as any).userId, (args as any).roleId),
          { headers },
        );
        return {
          success: true,
          message: `Role ${(args as any).roleId} assigned to user ${(args as any).userId}`,
        };
      } catch (error) {
        handleDiscordError(error, 'assign role');
      }
    },
  });
}
