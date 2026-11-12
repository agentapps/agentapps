import type { AgentApp } from '@agentapps/sdk';
import { intInRange, optionalString, playlistId } from '../lib/args.js';
import { apiGet, DATA_BASE_URL } from '../lib/client.js';
import { type DataList, MAX_PAGE_SIZE, videoUrl } from '../lib/youtube.js';

interface PlaylistItemResource {
  snippet?: {
    title?: string;
    position?: number;
    videoOwnerChannelTitle?: string;
    publishedAt?: string;
  };
  contentDetails?: { videoId?: string; videoPublishedAt?: string };
  status?: { privacyStatus?: string };
}

export function registerListPlaylistVideosTool(app: AgentApp): void {
  app.tool('list-playlist-videos', {
    description:
      'List the videos in a playlist, in playlist order: position, videoId, title, ' +
      'videoPublishedAt, addedAt, privacyStatus, owner channel and url. Up to 50 per page with ' +
      'nextPageToken. Deleted or private videos appear with their placeholder title. Use ' +
      'get-videos on the ids for stats.',
    parameters: {
      type: 'object',
      properties: {
        playlistId: {
          type: 'string',
          description:
            'Playlist id (PL..., or UU... for a channel’s uploads), from list-playlists.',
        },
        maxResults: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Videos per page (1-50, default 50).',
        },
        pageToken: { type: 'string', description: 'nextPageToken from the previous call.' },
      },
      required: ['playlistId'],
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
      const id = playlistId(a);
      const maxResults = intInRange(a, 'maxResults', 1, MAX_PAGE_SIZE, MAX_PAGE_SIZE);
      const pageToken = optionalString(a, 'pageToken', 200);
      const page = await apiGet<DataList<PlaylistItemResource>>(
        DATA_BASE_URL,
        '/playlistItems',
        ctx,
        {
          params: { part: 'snippet,contentDetails,status', playlistId: id, maxResults, pageToken },
        },
      );
      const videos = (page.items ?? []).map((item) => {
        const videoId = item.contentDetails?.videoId ?? null;
        return {
          position: item.snippet?.position ?? null,
          videoId,
          title: item.snippet?.title,
          videoPublishedAt: item.contentDetails?.videoPublishedAt ?? null,
          addedAt: item.snippet?.publishedAt,
          privacyStatus: item.status?.privacyStatus,
          ownerChannelTitle: item.snippet?.videoOwnerChannelTitle ?? null,
          url: videoId ? videoUrl(videoId) : null,
        };
      });
      return {
        playlistId: id,
        videos,
        count: videos.length,
        totalResults: page.pageInfo?.totalResults ?? null,
        ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {}),
      };
    },
  });
}
