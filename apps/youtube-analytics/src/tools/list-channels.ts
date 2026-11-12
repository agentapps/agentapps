import type { AgentApp } from '@agentapps/sdk';
import { apiGet, DATA_BASE_URL } from '../lib/client.js';
import {
  type ChannelResource,
  count,
  type DataList,
  MAX_PAGE_SIZE,
  thumbnail,
  truncate,
} from '../lib/youtube.js';

export function registerListChannelsTool(app: AgentApp): void {
  app.tool('list-channels', {
    description:
      'List the YouTube channels of the connected Google account (usually one; a Brand Account ' +
      'may manage several). Returns id (UC...), title, handle, publishedAt, subscribers, views, ' +
      'videoCount and uploadsPlaylistId. Start here: pass a channel id as channelId to the report ' +
      'tools when the account has more than one channel (they default to the account’s own channel).',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const page = await apiGet<DataList<ChannelResource>>(DATA_BASE_URL, '/channels', ctx, {
        params: {
          part: 'snippet,statistics,contentDetails',
          mine: true,
          maxResults: MAX_PAGE_SIZE,
        },
      });
      const channels = (page.items ?? []).map((c) => ({
        id: c.id,
        title: c.snippet?.title,
        handle: c.snippet?.customUrl,
        url: `https://www.youtube.com/channel/${c.id}`,
        publishedAt: c.snippet?.publishedAt,
        country: c.snippet?.country,
        description: truncate(c.snippet?.description, 300),
        thumbnail: thumbnail(c.snippet?.thumbnails),
        // Hidden subscriber counts come back as absent; report null rather than 0.
        subscribers: c.statistics?.hiddenSubscriberCount
          ? null
          : count(c.statistics?.subscriberCount),
        views: count(c.statistics?.viewCount),
        videoCount: count(c.statistics?.videoCount),
        uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads,
      }));
      return {
        channels,
        count: channels.length,
        ...(channels.length === 0
          ? { note: 'The connected Google account has no YouTube channel.' }
          : {}),
      };
    },
  });
}
