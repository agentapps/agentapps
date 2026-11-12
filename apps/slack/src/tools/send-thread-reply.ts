import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractMessage, validateChannelId, validateMessageTs } from './_helpers.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface SendThreadReplyArgs {
  channel: string;
  threadTs: string;
  text: string;
  blocks?: string;
  broadcast?: boolean;
}

export function registerSendThreadReplyTool(app: AgentApp): void {
  app.tool('send-thread-reply', {
    description:
      'Reply inside a Slack thread. Returns { ts, channel, threadTs, broadcast, message }. Not retryable (no idempotency key). Params: channel, threadTs, text, blocks? (JSON), broadcast (def false).',
    parameters: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel id where the parent message lives.',
        },
        threadTs: {
          type: 'string',
          description: 'Parent message ts (1234567890.123456).',
        },
        text: {
          type: 'string',
          description: 'Plain text reply body.',
        },
        blocks: {
          type: 'string',
          description: 'Optional Slack Block Kit JSON string.',
        },
        broadcast: {
          type: 'boolean',
          description: 'Also broadcast the reply to the channel. Default false.',
        },
      },
      required: ['channel', 'threadTs', 'text'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      const { channel, threadTs, text, blocks, broadcast } = args as unknown as SendThreadReplyArgs;
      validateChannelId(channel, 'channel');
      validateMessageTs(threadTs, 'threadTs');
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('text must be a non-empty string.');
      }
      let parsedBlocks: unknown[] | undefined;
      if (typeof blocks === 'string' && blocks.trim().length > 0) {
        try {
          const parsed = JSON.parse(blocks);
          if (!Array.isArray(parsed)) {
            throw new Error('blocks must parse to a JSON array.');
          }
          parsedBlocks = parsed;
        } catch (err) {
          throw new Error(
            `Invalid blocks JSON: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.chat.postMessage(
          sanitiseBody({
            channel,
            thread_ts: threadTs,
            text,
            blocks: parsedBlocks,
            reply_broadcast: broadcast ?? false,
          }) as any,
        ),
      );

      return {
        ts: result.ts ?? '',
        channel: result.channel ?? channel,
        threadTs,
        broadcast: broadcast ?? false,
        message: result.message ? extractMessage(result.message, { channel }) : null,
      };
    },
  });
}
