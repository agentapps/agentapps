import type { AgentApp } from '@agentapps/sdk';
import { bad, intInRange, oneOf, optionalString } from '../lib/args.js';
import { apiGet, DATA_BASE_URL } from '../lib/client.js';
import {
  type DataList,
  decodeEntities,
  MAX_PAGE_SIZE,
  truncate,
  videoUrl,
} from '../lib/youtube.js';

const ORDER = ['relevance', 'date', 'viewCount', 'rating', 'title'] as const;

interface SearchResult {
  id?: { kind?: string; videoId?: string };
  snippet?: {
    publishedAt?: string;
    title?: string;
    description?: string;
    liveBroadcastContent?: string;
  };
}

export function registerSearchVideosTool(app: AgentApp): void {
  app.tool('search-videos', {
    description:
      'Search the connected account’s own videos by keyword (title, description, tags). Returns ' +
      'id, title, publishedAt, url, a short description and liveBroadcastContent; up to 50 per ' +
      'page with nextPageToken. Expensive: 100 quota units per call out of a default 10,000 a ' +
      'day, so prefer list-videos to browse. Very recent uploads can take a while to appear.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search words. Leave empty to list all own videos in the chosen order.',
        },
        order: {
          type: 'string',
          enum: [...ORDER],
          description: 'Sort order. Default relevance (date when no query).',
        },
        maxResults: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Results per page (1-50, default 25).',
        },
        pageToken: { type: 'string', description: 'nextPageToken from the previous call.' },
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
      const query = optionalString(a, 'query', 200);
      const order = oneOf(a, 'order', ORDER, query ? 'relevance' : 'date');
      const maxResults = intInRange(a, 'maxResults', 1, MAX_PAGE_SIZE, 25);
      const pageToken = optionalString(a, 'pageToken', 200);
      if (query && [...query].some((c) => c.charCodeAt(0) < 0x20))
        throw bad('query must not contain control characters.');

      // forMine searches the authenticated user's channel; it requires type=video.
      const page = await apiGet<DataList<SearchResult>>(DATA_BASE_URL, '/search', ctx, {
        params: {
          part: 'snippet',
          forMine: true,
          type: 'video',
          q: query,
          order,
          maxResults,
          pageToken,
        },
      });
      const videos = (page.items ?? [])
        .filter((r) => r.id?.videoId)
        .map((r) => {
          const id = r.id?.videoId as string;
          return {
            id,
            title: decodeEntities(r.snippet?.title),
            publishedAt: r.snippet?.publishedAt,
            url: videoUrl(id),
            description: truncate(decodeEntities(r.snippet?.description), 200),
            liveBroadcastContent: r.snippet?.liveBroadcastContent,
          };
        });
      return {
        ...(query ? { query } : {}),
        order,
        videos,
        count: videos.length,
        ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {}),
      };
    },
  });
}
