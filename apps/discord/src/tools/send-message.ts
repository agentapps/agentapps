import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerSendMessageTool(app: AgentApp): void {
  app.tool('send-message', {
    description:
      'Send a message to a Discord channel. Supports text, embeds, mentions, and replies.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'The ID of the channel to send the message to' },
        content: { type: 'string', description: 'The text content of the message' },
        embeds: {
          type: 'string',
          description: 'JSON string of embed objects array (see Discord embed documentation)',
        },
        replyToMessageId: { type: 'string', description: 'Message ID to reply to' },
        mentionEveryone: {
          type: 'boolean',
          description: 'Allow @everyone and @here mentions',
          default: false,
        },
        mentionRoles: { type: 'boolean', description: 'Allow role mentions', default: true },
        mentionUsers: { type: 'boolean', description: 'Allow user mentions', default: true },
        tts: { type: 'boolean', description: 'Send as text-to-speech message', default: false },
      },
      required: ['channelId'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const body: Record<string, unknown> = {
          allowed_mentions: {
            parse: [] as string[],
            roles: [] as string[],
            users: [] as string[],
            replied_user: false,
          },
        };
        if ((args as any).content) body.content = (args as any).content;
        if ((args as any).tts) body.tts = (args as any).tts;
        if ((args as any).embeds) {
          try {
            body.embeds = JSON.parse((args as any).embeds);
          } catch {
            throw new Error('Invalid embeds JSON. Must be a valid JSON array of embed objects.');
          }
        }
        if ((args as any).replyToMessageId) {
          body.message_reference = {
            message_id: (args as any).replyToMessageId,
            channel_id: (args as any).channelId,
          };
        }
        const parse: string[] = [];
        if ((args as any).mentionEveryone) parse.push('everyone');
        if ((args as any).mentionRoles ?? true) parse.push('roles');
        if ((args as any).mentionUsers ?? true) parse.push('users');
        (body.allowed_mentions as Record<string, unknown>).parse = parse;
        const message = (await rest.post(Routes.channelMessages((args as any).channelId), {
          body,
        })) as Record<string, unknown>;
        return {
          success: true,
          id: message.id,
          channel_id: message.channel_id,
          content: message.content,
          timestamp: message.timestamp,
          url: `https://discord.com/channels/${(message as any).guild_id ?? '@me'}/${message.channel_id}/${message.id}`,
        };
      } catch (error) {
        handleDiscordError(error, 'send message');
      }
    },
  });
}
