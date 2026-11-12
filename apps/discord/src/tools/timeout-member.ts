import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerTimeoutMemberTool(app: AgentApp): void {
  app.tool('timeout-member', {
    description:
      'Timeout (mute) a guild member for a specified duration. Requires Moderate Members permission.',
    parameters: {
      type: 'object',
      properties: {
        guildId: { type: 'string', description: 'The ID of the guild' },
        userId: { type: 'string', description: 'The ID of the user to timeout' },
        durationMinutes: {
          type: 'number',
          description: 'Duration of the timeout in minutes (max 40320 = 28 days)',
          default: 60,
        },
        reason: { type: 'string', description: 'Reason for the timeout (for audit log)' },
      },
      required: ['guildId', 'userId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const durationMs = Math.min(
          ((args as any).durationMinutes ?? 60) * 60 * 1000,
          28 * 24 * 60 * 60 * 1000,
        );
        const timeoutUntil = new Date(Date.now() + durationMs).toISOString();
        const body: Record<string, unknown> = { communication_disabled_until: timeoutUntil };
        const headers: Record<string, string> = {};
        if ((args as any).reason) headers['X-Audit-Log-Reason'] = (args as any).reason;
        const member = (await rest.patch(
          Routes.guildMember((args as any).guildId, (args as any).userId),
          {
            body,
            headers,
          },
        )) as Record<string, unknown>;
        return {
          success: true,
          message: `User ${(args as any).userId} timed out until ${timeoutUntil}`,
          communication_disabled_until: member.communication_disabled_until,
          reason: (args as any).reason,
        };
      } catch (error) {
        handleDiscordError(error, 'timeout member');
      }
    },
  });
}
