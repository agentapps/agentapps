import type { AgentApp } from '@agentapps/sdk';
import { Routes } from 'discord.js';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerAddReactionTool(app: AgentApp): void {
  app.tool('add-reaction', {
    description:
      'Add a reaction (emoji) to a message. Use Unicode emoji or custom emoji format name:id.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'The ID of the channel containing the message' },
        messageId: { type: 'string', description: 'The ID of the message to react to' },
        emoji: {
          type: 'string',
          description: 'The emoji to react with (Unicode emoji or custom format name:id)',
        },
      },
      required: ['channelId', 'messageId', 'emoji'],
    },
    // A PUT: reacting twice with the same emoji leaves one reaction.
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
        const encodedEmoji = encodeURIComponent((args as any).emoji as string);
        await rest.put(
          Routes.channelMessageReaction(
            (args as any).channelId as `/${string}`,
            (args as any).messageId as `/${string}`,
            encodedEmoji as `/${string}`,
          ),
        );
        return {
          success: true,
          message: `Reaction ${(args as any).emoji} added to message ${(args as any).messageId}`,
        };
      } catch (error) {
        handleDiscordError(error, 'add reaction');
      }
    },
  });
}
