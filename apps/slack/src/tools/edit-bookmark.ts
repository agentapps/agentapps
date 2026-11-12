import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractBookmark, validateChannelId } from './_helpers.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface EditBookmarkArgs {
  channel: string;
  bookmarkId: string;
  title?: string;
  link?: string;
  emoji?: string;
}

export function registerEditBookmarkTool(app: AgentApp): void {
  app.tool('edit-bookmark', {
    description:
      'Edit an existing channel bookmark. Partial update. Returns the updated bookmark. Not retryable. Params: channel, bookmarkId, title?, link? (http/https), emoji?.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id.' },
        bookmarkId: { type: 'string', description: 'Bookmark id.' },
        title: { type: 'string', description: 'New title.' },
        link: { type: 'string', description: 'New URL.' },
        emoji: { type: 'string', description: 'New emoji shortcode.' },
      },
      required: ['channel', 'bookmarkId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const a = args as unknown as EditBookmarkArgs;
      validateChannelId(a.channel, 'channel');
      if (typeof a.bookmarkId !== 'string' || a.bookmarkId.trim().length === 0) {
        throw new Error('bookmarkId must be a non-empty string.');
      }
      if (a.link !== undefined && !/^https?:\/\//.test(a.link)) {
        throw new Error('link must be an http:// or https:// URL.');
      }
      if (a.title === undefined && a.link === undefined && a.emoji === undefined) {
        throw new Error('Provide at least one field to update.');
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.bookmarks.edit(
          sanitiseBody({
            channel_id: a.channel,
            bookmark_id: a.bookmarkId,
            title: a.title,
            link: a.link,
            emoji: a.emoji,
          }) as any,
        ),
      );
      const raw = (result as any).bookmark;
      if (!raw) {
        throw new Error(
          'Slack returned empty bookmark response (verify the bookmarkId exists in this channel).',
        );
      }
      return extractBookmark(raw);
    },
  });
}
