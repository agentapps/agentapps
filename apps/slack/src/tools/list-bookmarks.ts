import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractBookmark, validateChannelId } from './_helpers.js';
import { wrapSlackCall } from './utils.js';

interface ListBookmarksArgs {
  channel: string;
  limit?: number;
  cursor?: string;
  includeRaw?: boolean;
}

export function registerListBookmarksTool(app: AgentApp): void {
  app.tool('list-bookmarks', {
    description:
      'List bookmarks attached to a channel. Returns { bookmarks: [{ id, channelId, title, link, emoji, type, dateCreated, dateUpdated, rank }], count }. Retryable. Params: channel.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id.' },
      },
      required: ['channel'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { channel, includeRaw } = args as unknown as ListBookmarksArgs;
      validateChannelId(channel, 'channel');
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() => client.bookmarks.list({ channel_id: channel }));
      if (includeRaw) return result;
      const bookmarks = ((result.bookmarks ?? []) as any[]).map(extractBookmark);
      return { bookmarks, count: bookmarks.length };
    },
  });
}
