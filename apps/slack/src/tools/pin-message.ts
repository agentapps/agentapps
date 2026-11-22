import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId, validateMessageTs } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface PinMessageArgs {
  channel: string;
  timestamp: string;
}

export function registerPinMessageTool(app: AgentApp): void {
  app.tool('pin-message', {
    description:
      'Pin a message to a channel. Returns { channel, timestamp, pinned: true }. Idempotent (already_pinned not treated as error). Params: channel, timestamp.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id (C... / G... / D... / M...).' },
        timestamp: { type: 'string', description: 'Message timestamp ("1234567890.123456").' },
      },
      required: ['channel', 'timestamp'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { channel, timestamp } = args as unknown as PinMessageArgs;
      validateChannelId(channel, 'channel');
      validateMessageTs(timestamp, 'timestamp');
      const { client } = await getSlackSession(ctx);
      try {
        await wrapSlackMutation(() => client.pins.add({ channel, timestamp }));
      } catch (e: any) {
        // Slack returns "already_pinned" when item is already pinned — treat as success (idempotent).
        const code = e?.upstreamMessage ?? e?.message ?? '';
        if (!code.includes('already_pinned')) throw e;
      }
      return { channel, timestamp, pinned: true };
    },
  });
}
