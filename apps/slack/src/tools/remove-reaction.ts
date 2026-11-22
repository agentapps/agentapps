import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId, validateMessageTs } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface RemoveReactionArgs {
  channel: string;
  timestamp: string;
  name: string;
}

const EMOJI_NAME_RE = /^[a-z0-9_+-]+$/;

export function registerRemoveReactionTool(app: AgentApp): void {
  app.tool('remove-reaction', {
    description:
      'Remove an emoji reaction from a message. Returns { channel, timestamp, name }. Idempotent (no_reaction raises BUSINESS_RULE). Params: channel, timestamp, name (no colons).',
    parameters: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel id where the message is.',
        },
        timestamp: {
          type: 'string',
          description: 'Message ts (1234567890.123456).',
        },
        name: {
          type: 'string',
          description: "Emoji name without colons (e.g. 'thumbsup').",
        },
      },
      required: ['channel', 'timestamp', 'name'],
    },
    // Reversible with add-reaction; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { channel, timestamp, name } = args as unknown as RemoveReactionArgs;
      validateChannelId(channel, 'channel');
      validateMessageTs(timestamp, 'timestamp');
      if (!EMOJI_NAME_RE.test(name)) {
        throw new Error(
          `Invalid emoji name "${name}": must be lowercase alnum/underscore/+/-, no colons.`,
        );
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() => client.reactions.remove({ channel, timestamp, name }));
      return { channel, timestamp, name };
    },
  });
}
