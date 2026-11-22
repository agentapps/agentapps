import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerCreateRoleTool(app: AgentApp): void {
  app.tool('create-role', {
    description: 'Create a new role in a guild. Requires Manage Roles permission.',
    parameters: {
      type: 'object',
      properties: {
        guildId: { type: 'string', description: 'The ID of the guild' },
        name: { type: 'string', description: 'The name of the role', default: 'new role' },
        color: { type: 'number', description: 'Integer color value (0 = default)', default: 0 },
        hoist: {
          type: 'boolean',
          description: 'Whether the role is displayed separately in the sidebar',
          default: false,
        },
        icon: { type: 'string', description: 'Base64-encoded image data for the role icon' },
        unicodeEmoji: { type: 'string', description: 'Unicode emoji for the role icon' },
        mentionable: {
          type: 'boolean',
          description: 'Whether the role can be mentioned',
          default: false,
        },
        permissions: {
          type: 'string',
          description: 'Bitwise permission flags as a string',
          default: '0',
        },
        reason: { type: 'string', description: 'Reason for creating the role (for audit log)' },
      },
      required: ['guildId'],
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
        const body: Record<string, unknown> = {
          name: (args as any).name ?? 'new role',
          color: (args as any).color ?? 0,
          hoist: (args as any).hoist ?? false,
          mentionable: (args as any).mentionable ?? false,
          permissions: (args as any).permissions ?? '0',
        };
        if ((args as any).icon) body.icon = (args as any).icon;
        if ((args as any).unicodeEmoji) body.unicode_emoji = (args as any).unicodeEmoji;
        const headers: Record<string, string> = {};
        if ((args as any).reason) headers['X-Audit-Log-Reason'] = (args as any).reason;
        const role = (await rest.post(Routes.guildRoles((args as any).guildId), {
          body,
          headers,
        })) as Record<string, unknown>;
        return {
          id: role.id,
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          icon: role.icon,
          unicode_emoji: role.unicode_emoji,
          position: role.position,
          permissions: role.permissions,
          managed: role.managed,
          mentionable: role.mentionable,
          flags: role.flags,
        };
      } catch (error) {
        handleDiscordError(error, 'create role');
      }
    },
  });
}
