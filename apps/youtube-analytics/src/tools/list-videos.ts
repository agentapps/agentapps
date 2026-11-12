import type { AgentApp } from '@agentapps/sdk';
import { channelId, intInRange, optionalString } from '../lib/args.js';
import { apiGet, DATA_BASE_URL } from '../lib/client.js';
import {
  type DataList,
  fetchVideos,
  MAX_PAGE_SIZE,
  summarizeVideo,
  uploadsPlaylist,
} from '../lib/youtube.js';

interface PlaylistItem {
  contentDetails?: { videoId?: string };
}

export function registerListVideosTool(app: AgentApp): void {
  app.tool('list-videos', {
    description:
      'List the channel’s uploaded videos, newest first, with lifetime stats: id, title, ' +
      'publishedAt, url, privacyStatus (public, unlisted, private), durationSeconds, views, ' +
      'likes, comments. Up to 50 per page; pass nextPageToken back as pageToken for more. Costs ' +
      '3 quota units per page. To find videos by keyword use search-videos.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Videos per page (1-50, default 25).',
        },
        pageToken: { type: 'string', description: 'nextPageToken from the previous call.' },
        channelId: {
          type: 'string',
          description:
            'Channel id (UC...). Default: the connected account’s channel. Private and unlisted videos only show for your own channel.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const maxResults = intInRange(a, 'maxResults', 1, MAX_PAGE_SIZE, 25);
      const pageToken = optionalString(a, 'pageToken', 200);
      const uploads = await uploadsPlaylist(ctx, channelId(a));

      const page = await apiGet<DataList<PlaylistItem>>(DATA_BASE_URL, '/playlistItems', ctx, {
        params: { part: 'contentDetails', playlistId: uploads.playlistId, maxResults, pageToken },
      });
      const ids = (page.items ?? [])
        .map((i) => i.contentDetails?.videoId)
        .filter((id): id is string => typeof id === 'string');
      const videos = ids.length > 0 ? await fetchVideos(ctx, ids) : [];
      // videos.list does not keep the playlist order; restore it.
      const byId = new Map(videos.map((v) => [v.id, v]));
      const ordered = ids.flatMap((id) => {
        const v = byId.get(id);
        return v ? [summarizeVideo(v)] : [];
      });
      return {
        channelId: uploads.channelId,
        channelTitle: uploads.channelTitle,
        videos: ordered,
        count: ordered.length,
        totalResults: page.pageInfo?.totalResults ?? null,
        ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {}),
      };
    },
  });
}
