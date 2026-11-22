import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface RemoveBookmarkArgs {
  channel: string;
  bookmarkId: string;
}

export function registerRemoveBookmarkTool(app: AgentApp): void {
  app.tool('remove-bookmark', {
    description:
      'Remove a channel bookmark by id. Returns { channel, bookmarkId, removed: true }. Not retryable. Params: channel, bookmarkId.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id.' },
        bookmarkId: {
          type: 'string',
          description: 'Bookmark id from add-bookmark / list-bookmarks.',
        },
      },
      required: ['channel', 'bookmarkId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { channel, bookmarkId } = args as unknown as RemoveBookmarkArgs;
      validateChannelId(channel, 'channel');
      if (typeof bookmarkId !== 'string' || bookmarkId.trim().length === 0) {
        throw new Error('bookmarkId must be a non-empty string.');
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        client.bookmarks.remove({ channel_id: channel, bookmark_id: bookmarkId }),
      );
      return { channel, bookmarkId, removed: true };
    },
  });
}
