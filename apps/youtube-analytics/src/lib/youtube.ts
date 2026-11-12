/**
 * YouTube Data API v3 helpers: the read calls the tools share and the curated shapes they
 * return. The Data API sends counts as strings ("1234"); they become numbers here.
 */

import { apiGet, type ClientContext, DATA_BASE_URL } from './client.js';

/** Data API list calls return at most 50 items per page. */
export const MAX_PAGE_SIZE = 50;
const MAX_DESCRIPTION_CHARS = 500;

interface Thumbnails {
  [size: string]: { url?: string } | undefined;
}

export interface DataList<T> {
  items?: T[];
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo?: { totalResults?: number; resultsPerPage?: number };
}

export interface ChannelResource {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    publishedAt?: string;
    country?: string;
    thumbnails?: Thumbnails;
  };
  statistics?: {
    viewCount?: string;
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    videoCount?: string;
  };
  contentDetails?: { relatedPlaylists?: { uploads?: string; likes?: string } };
}

export interface VideoResource {
  id: string;
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    title?: string;
    description?: string;
    channelTitle?: string;
    tags?: string[];
    categoryId?: string;
    liveBroadcastContent?: string;
    thumbnails?: Thumbnails;
  };
  contentDetails?: { duration?: string; definition?: string; caption?: string };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
    favoriteCount?: string;
  };
  status?: {
    privacyStatus?: string;
    uploadStatus?: string;
    publishAt?: string;
    madeForKids?: boolean;
  };
}

/** A string count from the Data API as a number; null when hidden or absent. */
export function count(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** ISO 8601 duration (PT1H2M3S, P1DT2H) to seconds; null when absent or unparsable. */
export function durationSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m) return null;
  const [, d, h, min, s] = m.map((v) => Number(v ?? 0));
  return d * 86_400 + h * 3_600 + min * 60 + s;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
};

/** search.list returns titles with HTML entities (&#39;, &amp;); decode them. */
export function decodeEntities(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return match;
  });
}

export function truncate(
  text: string | undefined,
  max = MAX_DESCRIPTION_CHARS,
): string | undefined {
  if (text === undefined) return undefined;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function thumbnail(thumbnails: Thumbnails | undefined): string | undefined {
  return thumbnails?.medium?.url ?? thumbnails?.high?.url ?? thumbnails?.default?.url;
}

export const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export function summarizeVideo(v: VideoResource): Record<string, unknown> {
  return {
    id: v.id,
    title: v.snippet?.title,
    publishedAt: v.snippet?.publishedAt,
    url: videoUrl(v.id),
    privacyStatus: v.status?.privacyStatus,
    durationSeconds: durationSeconds(v.contentDetails?.duration),
    views: count(v.statistics?.viewCount),
    likes: count(v.statistics?.likeCount),
    comments: count(v.statistics?.commentCount),
  };
}

/** Looks up videos by id in batches of 50 (one quota unit per call). */
export async function fetchVideos(
  ctx: ClientContext,
  ids: string[],
  part = 'snippet,contentDetails,statistics,status',
): Promise<VideoResource[]> {
  const out: VideoResource[] = [];
  for (let i = 0; i < ids.length; i += MAX_PAGE_SIZE) {
    const batch = ids.slice(i, i + MAX_PAGE_SIZE);
    const page = await apiGet<DataList<VideoResource>>(DATA_BASE_URL, '/videos', ctx, {
      params: { part, id: batch.join(','), maxResults: MAX_PAGE_SIZE },
    });
    out.push(...(page.items ?? []));
  }
  return out;
}

/** The uploads playlist of a channel (the connected account's own when no id is given). */
export async function uploadsPlaylist(
  ctx: ClientContext,
  channel: string | undefined,
): Promise<{ channelId: string; channelTitle?: string; playlistId: string }> {
  const page = await apiGet<DataList<ChannelResource>>(DATA_BASE_URL, '/channels', ctx, {
    params: {
      part: 'snippet,contentDetails',
      ...(channel ? { id: channel } : { mine: true }),
      maxResults: MAX_PAGE_SIZE,
    },
  });
  const found = page.items?.[0];
  const playlistId = found?.contentDetails?.relatedPlaylists?.uploads;
  if (!found || !playlistId) {
    throw new Error(
      channel
        ? `[NOT_FOUND] Channel ${channel} was not found. Call list-channels for the connected account's channels.`
        : '[NOT_FOUND] The connected Google account has no YouTube channel. Create one at youtube.com or connect another account.',
    );
  }
  return { channelId: found.id, channelTitle: found.snippet?.title, playlistId };
}
