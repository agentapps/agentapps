import type { AgentApp } from '@agentapps/sdk';
import { channelId, intInRange, optionalString } from '../lib/args.js';
import { apiGet, DATA_BASE_URL } from '../lib/client.js';
import { type DataList, MAX_PAGE_SIZE, truncate } from '../lib/youtube.js';

interface PlaylistResource {
  id: string;
  snippet?: { publishedAt?: string; title?: string; description?: string };
  contentDetails?: { itemCount?: number };
  status?: { privacyStatus?: string };
}

export function registerListPlaylistsTool(app: AgentApp): void {
  app.tool('list-playlists', {
    description:
      'List the channel’s playlists: id, title, description (first 200 characters), ' +
      'publishedAt, itemCount, privacyStatus and url. Up to 50 per page with nextPageToken. Use ' +
      'list-playlist-videos for a playlist’s videos, or run-report with filters playlist==ID ' +
      'for its analytics.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Playlists per page (1-50, default 25).',
        },
        pageToken: { type: 'string', description: 'nextPageToken from the previous call.' },
        channelId: {
          type: 'string',
          description:
            'Channel id (UC...). Default: the connected account’s channel (includes private playlists).',
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
      const channel = channelId(a);
      const page = await apiGet<DataList<PlaylistResource>>(DATA_BASE_URL, '/playlists', ctx, {
        params: {
          part: 'snippet,contentDetails,status',
          ...(channel ? { channelId: channel } : { mine: true }),
          maxResults,
          pageToken,
        },
      });
      const playlists = (page.items ?? []).map((p) => ({
        id: p.id,
        title: p.snippet?.title,
        description: truncate(p.snippet?.description, 200),
        publishedAt: p.snippet?.publishedAt,
        itemCount: p.contentDetails?.itemCount ?? null,
        privacyStatus: p.status?.privacyStatus,
        url: `https://www.youtube.com/playlist?list=${p.id}`,
      }));
      return {
        playlists,
        count: playlists.length,
        totalResults: page.pageInfo?.totalResults ?? null,
        ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {}),
      };
    },
  });
}
