import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerListMessagesTool(app: AgentApp): void {
  app.tool('list-messages', {
    description:
      'List messages in a channel. Supports pagination via before/after/around message IDs.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'The ID of the channel' },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (1-100)',
          default: 50,
        },
        before: { type: 'string', description: 'Get messages before this message ID' },
        after: { type: 'string', description: 'Get messages after this message ID' },
        around: { type: 'string', description: 'Get messages around this message ID' },
      },
      required: ['channelId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const params = new URLSearchParams();
        if ((args as any).limit) params.set('limit', String(Math.min((args as any).limit, 100)));
        if ((args as any).before) params.set('before', (args as any).before);
        if ((args as any).after) params.set('after', (args as any).after);
        if ((args as any).around) params.set('around', (args as any).around);
        const qs = params.toString();
        const path = qs
          ? `${Routes.channelMessages((args as any).channelId as `/${string}`)}?${qs}`
          : Routes.channelMessages((args as any).channelId as `/${string}`);
        const messages = (await rest.get(path as `/${string}`)) as Array<Record<string, unknown>>;
        return {
          messages: messages.map((m) => ({
            id: m.id,
            channel_id: m.channel_id,
            author: m.author
              ? {
                  id: (m.author as any).id,
                  username: (m.author as any).username,
                  global_name: (m.author as any).global_name,
                  bot: (m.author as any).bot,
                }
              : null,
            content: m.content,
            timestamp: m.timestamp,
            edited_timestamp: m.edited_timestamp,
            tts: m.tts,
            mention_everyone: m.mention_everyone,
            mentions: m.mentions,
            attachments: m.attachments,
            embeds: m.embeds,
            reactions: m.reactions,
            pinned: m.pinned,
            type: m.type,
            thread: m.thread,
            referenced_message: m.referenced_message,
          })),
          total: messages.length,
        };
      } catch (error) {
        handleDiscordError(error, 'list messages');
      }
    },
  });
}
