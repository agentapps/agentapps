import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId, validateMessageTs } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface AddReactionArgs {
  channel: string;
  timestamp: string;
  name: string;
}

const EMOJI_NAME_RE = /^[a-z0-9_+-]+$/;

export function registerAddReactionTool(app: AgentApp): void {
  app.tool('add-reaction', {
    description:
      'Add an emoji reaction to a message. Returns { channel, timestamp, name }. Idempotent (already_reacted raises BUSINESS_RULE). Params: channel, timestamp, name (no colons).',
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
          description: "Emoji name without colons (e.g. 'thumbsup', 'fire').",
        },
      },
      required: ['channel', 'timestamp', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { channel, timestamp, name } = args as unknown as AddReactionArgs;
      validateChannelId(channel, 'channel');
      validateMessageTs(timestamp, 'timestamp');
      if (!EMOJI_NAME_RE.test(name)) {
        throw new Error(
          `Invalid emoji name "${name}": must be lowercase alnum/underscore/+/-, no colons.`,
        );
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() => client.reactions.add({ channel, timestamp, name }));
      return { channel, timestamp, name };
    },
  });
}
