import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId, validateMessageTs } from './_helpers.js';
import { wrapSlackCall } from './utils.js';

interface GetPermalinkArgs {
  channel: string;
  ts: string;
  includeRaw?: boolean;
}

export function registerGetPermalinkTool(app: AgentApp): void {
  app.tool('get-permalink', {
    description:
      'Get a permanent URL for a message. Returns { channel, ts, permalink }. Idempotent, retryable. Params: channel, ts.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id.' },
        ts: { type: 'string', description: 'Message timestamp.' },
      },
      required: ['channel', 'ts'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { channel, ts, includeRaw } = args as unknown as GetPermalinkArgs;
      validateChannelId(channel, 'channel');
      validateMessageTs(ts, 'ts');
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() =>
        client.chat.getPermalink({ channel, message_ts: ts }),
      );
      if (includeRaw) return result;
      return {
        channel,
        ts,
        permalink: result.permalink ?? null,
      };
    },
  });
}
