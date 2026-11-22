import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId, validateMessageTs } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface UnpinMessageArgs {
  channel: string;
  timestamp: string;
}

export function registerUnpinMessageTool(app: AgentApp): void {
  app.tool('unpin-message', {
    description:
      'Unpin a message. Returns { channel, timestamp, unpinned: true }. Idempotent (no_pin not treated as error). Params: channel, timestamp.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id.' },
        timestamp: { type: 'string', description: 'Message timestamp.' },
      },
      required: ['channel', 'timestamp'],
    },
    // Reversible with pin-message; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { channel, timestamp } = args as unknown as UnpinMessageArgs;
      validateChannelId(channel, 'channel');
      validateMessageTs(timestamp, 'timestamp');
      const { client } = await getSlackSession(ctx);
      try {
        await wrapSlackMutation(() => client.pins.remove({ channel, timestamp }));
      } catch (e: any) {
        const code = e?.upstreamMessage ?? e?.message ?? '';
        if (!code.includes('no_pin')) throw e;
      }
      return { channel, timestamp, unpinned: true };
    },
  });
}
