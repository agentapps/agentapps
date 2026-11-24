/** The scheduled post as Metricool returns it, and the shapes the tools give back. */

/** Every v2 answer wraps its payload in `data`. */
export interface Envelope<T> {
  data?: T;
}

export interface ScheduledPost {
  id?: number;
  publicationDate?: { dateTime?: string; timezone?: string };
  text?: string;
  firstCommentText?: string;
  providers?: Array<{ network?: string; status?: string; publicUrl?: string }>;
  media?: string[];
  draft?: boolean;
  [key: string]: unknown;
}

/** The networks a post can be scheduled on, as Metricool names them (`twitter` is X). */
export const POST_NETWORKS = [
  'twitter',
  'facebook',
  'instagram',
  'linkedin',
  'threads',
  'bluesky',
  'tiktok',
  'youtube',
  'pinterest',
  'gmb',
  'twitch',
] as const;

/** The per-network objects of a scheduled post: `twitterData`, `instagramData`, ... */
export const NETWORK_DATA_KEYS: readonly string[] = POST_NETWORKS.map(
  (network) => `${network}Data`,
);

const PREVIEW_CHARS = 280;

function networksOf(post: ScheduledPost) {
  return (Array.isArray(post.providers) ? post.providers : []).map((provider) => ({
    network: provider.network ?? '',
    status: provider.status ?? null,
    publicUrl: provider.publicUrl || null,
  }));
}

/** The short form `list-posts` returns. */
export function summarizePost(post: ScheduledPost) {
  return {
    id: post.id ?? null,
    date: post.publicationDate?.dateTime ?? null,
    timezone: post.publicationDate?.timezone ?? null,
    draft: post.draft === true,
    preview: (post.text ?? '').slice(0, PREVIEW_CHARS),
    networks: networksOf(post),
  };
}

/** The full form `get-post` returns. */
export function describePost(post: ScheduledPost) {
  const networkData: Record<string, unknown> = {};
  for (const key of NETWORK_DATA_KEYS) {
    const value = post[key];
    if (value !== null && typeof value === 'object') networkData[key] = value;
  }
  return {
    id: post.id ?? null,
    date: post.publicationDate?.dateTime ?? null,
    timezone: post.publicationDate?.timezone ?? null,
    draft: post.draft === true,
    text: post.text ?? '',
    firstComment: post.firstCommentText || null,
    media: Array.isArray(post.media) ? post.media : [],
    networks: networksOf(post),
    networkData,
  };
}
