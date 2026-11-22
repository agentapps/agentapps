import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId, validateUserId } from './_helpers.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface SendEphemeralArgs {
  channel: string;
  user: string;
  text: string;
  blocks?: string;
  threadTs?: string;
}

export function registerSendEphemeralTool(app: AgentApp): void {
  app.tool('send-ephemeral', {
    description:
      'Post an ephemeral message visible only to one user in a channel. Returns { channel, user, messageTs }. Not retryable. Params: channel, user (recipient), text, blocks?, threadTs?.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id.' },
        user: {
          type: 'string',
          description: 'User id of the recipient (U... / W...). Only they will see it.',
        },
        text: { type: 'string', description: 'Plain text body (fallback for blocks).' },
        blocks: { type: 'string', description: 'Optional Block Kit JSON string.' },
        threadTs: { type: 'string', description: 'Parent message ts for ephemeral thread reply.' },
      },
      required: ['channel', 'user', 'text'],
    },
    // A send cannot be undone.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { channel, user, text, blocks, threadTs } = args as unknown as SendEphemeralArgs;
      validateChannelId(channel, 'channel');
      validateUserId(user, 'user');
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('text must be a non-empty string.');
      }
      let parsedBlocks: unknown[] | undefined;
      if (typeof blocks === 'string' && blocks.trim().length > 0) {
        try {
          const parsed = JSON.parse(blocks);
          if (!Array.isArray(parsed)) throw new Error('blocks must parse to a JSON array.');
          parsedBlocks = parsed;
        } catch (err) {
          throw new Error(
            `Invalid blocks JSON: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.chat.postEphemeral(
          sanitiseBody({
            channel,
            user,
            text,
            blocks: parsedBlocks,
            thread_ts: threadTs,
          }) as any,
        ),
      );
      return {
        channel,
        user,
        messageTs: result.message_ts ?? null,
      };
    },
  });
}
