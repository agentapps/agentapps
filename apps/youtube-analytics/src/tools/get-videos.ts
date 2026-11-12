import type { AgentApp } from '@agentapps/sdk';
import { videoIds } from '../lib/args.js';
import {
  count,
  durationSeconds,
  fetchVideos,
  MAX_PAGE_SIZE,
  thumbnail,
  truncate,
  videoUrl,
} from '../lib/youtube.js';

export function registerGetVideosTool(app: AgentApp): void {
  app.tool('get-videos', {
    description:
      'Details and lifetime stats of up to 50 videos by id: title, description (first 500 ' +
      'characters), tags, publishedAt, durationSeconds, definition, captions, privacyStatus, ' +
      'scheduled publishAt, madeForKids, views, likes, comments, thumbnail and url. Ids that do not ' +
      'exist or are not visible to the account are listed in notFound. For views in a date range ' +
      'use get-video-report.',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_PAGE_SIZE,
          description: '11-character video ids (1-50). A comma-separated string also works.',
        },
      },
      required: ['ids'],
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
      const ids = videoIds(a, 'ids', MAX_PAGE_SIZE);
      const found = await fetchVideos(ctx, ids);
      const videos = found.map((v) => ({
        id: v.id,
        title: v.snippet?.title,
        description: truncate(v.snippet?.description),
        tags: v.snippet?.tags ?? [],
        channelId: v.snippet?.channelId,
        channelTitle: v.snippet?.channelTitle,
        publishedAt: v.snippet?.publishedAt,
        categoryId: v.snippet?.categoryId,
        liveBroadcastContent: v.snippet?.liveBroadcastContent,
        durationSeconds: durationSeconds(v.contentDetails?.duration),
        definition: v.contentDetails?.definition,
        captions: v.contentDetails?.caption === 'true',
        privacyStatus: v.status?.privacyStatus,
        publishAt: v.status?.publishAt ?? null,
        madeForKids: v.status?.madeForKids ?? null,
        views: count(v.statistics?.viewCount),
        likes: count(v.statistics?.likeCount),
        comments: count(v.statistics?.commentCount),
        thumbnail: thumbnail(v.snippet?.thumbnails),
        url: videoUrl(v.id),
      }));
      const seen = new Set(found.map((v) => v.id));
      const notFound = ids.filter((id) => !seen.has(id));
      return { videos, count: videos.length, ...(notFound.length > 0 ? { notFound } : {}) };
    },
  });
}
