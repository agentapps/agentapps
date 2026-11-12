/**
 * Mock bodies shaped like real API responses, with synthetic values.
 *
 * Kept faithful to what the APIs send: the Analytics API returns numbers as numbers and
 * omits `rows` when there is no data; the Data API returns counts as strings, omits
 * `subscriberCount` when it is hidden, and search.list titles carry HTML entities.
 */

const dim = (name: string) => ({ name, columnType: 'DIMENSION', dataType: 'STRING' });
const int = (name: string) => ({ name, columnType: 'METRIC', dataType: 'INTEGER' });
const float = (name: string) => ({ name, columnType: 'METRIC', dataType: 'FLOAT' });

export const CHANNEL_ID = 'UCabcdefghijklmnopqrstuv';
export const VIDEO_A = 'aaaaaaaaaa1';
export const VIDEO_B = 'bbbbbbbbbb2';
export const UPLOADS = 'UUabcdefghijklmnopqrstuv';

export const CORE_HEADERS = [
  int('views'),
  int('estimatedMinutesWatched'),
  int('averageViewDuration'),
  float('averageViewPercentage'),
  int('subscribersGained'),
  int('subscribersLost'),
  int('likes'),
  int('comments'),
  int('shares'),
];

export const totalsTable = {
  kind: 'youtubeAnalytics#resultTable',
  columnHeaders: CORE_HEADERS,
  rows: [[1520, 4210, 166, 38.7, 12, 3, 88, 9, 4]],
};

export const emptyTotalsTable = {
  kind: 'youtubeAnalytics#resultTable',
  columnHeaders: CORE_HEADERS,
};

export const dailyTable = {
  kind: 'youtubeAnalytics#resultTable',
  columnHeaders: [dim('day'), ...CORE_HEADERS],
  rows: [
    ['2026-09-01', 50, 140, 168, 39.1, 1, 0, 3, 0, 0],
    ['2026-09-02', 61, 172, 169, 40.2, 0, 1, 4, 1, 0],
  ],
};

export const trafficTable = {
  kind: 'youtubeAnalytics#resultTable',
  columnHeaders: [dim('insightTrafficSourceType'), int('views'), int('estimatedMinutesWatched')],
  rows: [
    ['YT_SEARCH', 700, 2100],
    ['RELATED_VIDEO', 410, 1300],
    ['EXT_URL', 33, 60],
  ],
};

export const topVideosTable = {
  kind: 'youtubeAnalytics#resultTable',
  columnHeaders: [
    dim('video'),
    int('views'),
    int('estimatedMinutesWatched'),
    int('averageViewDuration'),
    float('averageViewPercentage'),
    int('likes'),
    int('comments'),
    int('shares'),
    int('subscribersGained'),
    int('subscribersLost'),
  ],
  rows: [
    [VIDEO_A, 900, 2500, 170, 41.2, 50, 6, 3, 8, 1],
    [VIDEO_B, 300, 800, 160, 35.0, 12, 1, 0, 2, 0],
  ],
};

export const retentionTable = {
  kind: 'youtubeAnalytics#resultTable',
  columnHeaders: [
    { name: 'elapsedVideoTimeRatio', columnType: 'DIMENSION', dataType: 'FLOAT' },
    float('audienceWatchRatio'),
    float('relativeRetentionPerformance'),
  ],
  rows: [
    [0.01, 1.02, 0.61],
    [0.02, 0.88, 0.55],
    [0.03, 0.71, 0.5],
  ],
};

export const demographicsTable = {
  kind: 'youtubeAnalytics#resultTable',
  columnHeaders: [dim('ageGroup'), dim('gender'), float('viewerPercentage')],
  rows: [
    ['age18-24', 'male', 22.4],
    ['age25-34', 'female', 18.1],
  ],
};

export const channelsList = {
  kind: 'youtube#channelListResponse',
  etag: 'etag-1',
  pageInfo: { totalResults: 1, resultsPerPage: 5 },
  items: [
    {
      kind: 'youtube#channel',
      etag: 'etag-2',
      id: CHANNEL_ID,
      snippet: {
        title: 'Example Channel',
        description: 'Videos about examples.',
        customUrl: '@examplechannel',
        publishedAt: '2019-03-04T10:11:12Z',
        thumbnails: {
          default: { url: 'https://yt3.ggpht.com/example=s88', width: 88, height: 88 },
        },
        localized: { title: 'Example Channel', description: 'Videos about examples.' },
        country: 'ES',
      },
      contentDetails: { relatedPlaylists: { likes: '', uploads: UPLOADS } },
      statistics: {
        viewCount: '123456',
        subscriberCount: '789',
        hiddenSubscriberCount: false,
        videoCount: '42',
      },
    },
  ],
};

export const playlistItemsOfUploads = {
  kind: 'youtube#playlistItemListResponse',
  nextPageToken: 'CAIQAA',
  pageInfo: { totalResults: 42, resultsPerPage: 2 },
  items: [
    {
      kind: 'youtube#playlistItem',
      id: 'item-1',
      contentDetails: { videoId: VIDEO_A, videoPublishedAt: '2026-09-10T08:00:00Z' },
    },
    {
      kind: 'youtube#playlistItem',
      id: 'item-2',
      contentDetails: { videoId: VIDEO_B, videoPublishedAt: '2026-08-01T08:00:00Z' },
    },
  ],
};

export function video(id: string, title: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: 'youtube#video',
    etag: `etag-${id}`,
    id,
    snippet: {
      publishedAt: '2026-09-10T08:00:00Z',
      channelId: CHANNEL_ID,
      title,
      description: 'A description. '.repeat(60),
      thumbnails: {
        medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, width: 320, height: 180 },
      },
      channelTitle: 'Example Channel',
      tags: ['example', 'tutorial'],
      categoryId: '27',
      liveBroadcastContent: 'none',
    },
    contentDetails: { duration: 'PT12M5S', dimension: '2d', definition: 'hd', caption: 'false' },
    status: {
      uploadStatus: 'processed',
      privacyStatus: 'public',
      license: 'youtube',
      madeForKids: false,
    },
    statistics: { viewCount: '1520', likeCount: '88', favoriteCount: '0', commentCount: '9' },
    ...overrides,
  };
}

/** videos.list answers in its own order, not the order of the ids asked for. */
export const videosList = {
  kind: 'youtube#videoListResponse',
  pageInfo: { totalResults: 2, resultsPerPage: 2 },
  items: [video(VIDEO_B, 'Second video'), video(VIDEO_A, 'First video')],
};

export const searchList = {
  kind: 'youtube#searchListResponse',
  nextPageToken: 'CBkQAA',
  regionCode: 'ES',
  pageInfo: { totalResults: 2, resultsPerPage: 25 },
  items: [
    {
      kind: 'youtube#searchResult',
      id: { kind: 'youtube#video', videoId: VIDEO_A },
      snippet: {
        publishedAt: '2026-09-10T08:00:00Z',
        channelId: CHANNEL_ID,
        title: 'Tom &amp; Jerry&#39;s &quot;best&quot; bits',
        description: 'It&#39;s here',
        channelTitle: 'Example Channel',
        liveBroadcastContent: 'none',
        publishTime: '2026-09-10T08:00:00Z',
      },
    },
  ],
};

export const playlistsList = {
  kind: 'youtube#playlistListResponse',
  pageInfo: { totalResults: 1, resultsPerPage: 25 },
  items: [
    {
      kind: 'youtube#playlist',
      id: 'PLabcdefghijklmnopqrstuvwxyz012345',
      snippet: { publishedAt: '2024-01-02T03:04:05Z', title: 'Tutorials', description: '' },
      status: { privacyStatus: 'public' },
      contentDetails: { itemCount: 7 },
    },
  ],
};

export const playlistItemsList = {
  kind: 'youtube#playlistItemListResponse',
  pageInfo: { totalResults: 2, resultsPerPage: 50 },
  items: [
    {
      kind: 'youtube#playlistItem',
      id: 'pli-1',
      snippet: {
        publishedAt: '2024-01-03T00:00:00Z',
        title: 'First video',
        position: 0,
        resourceId: { kind: 'youtube#video', videoId: VIDEO_A },
        videoOwnerChannelTitle: 'Example Channel',
      },
      contentDetails: { videoId: VIDEO_A, videoPublishedAt: '2023-12-01T00:00:00Z' },
      status: { privacyStatus: 'public' },
    },
    {
      kind: 'youtube#playlistItem',
      id: 'pli-2',
      snippet: {
        publishedAt: '2024-01-04T00:00:00Z',
        title: 'Private video',
        position: 1,
        resourceId: { kind: 'youtube#video', videoId: VIDEO_B },
      },
      contentDetails: { videoId: VIDEO_B },
      status: { privacyStatus: 'private' },
    },
  ],
};

/** A Google API error body. */
export function googleError(
  code: number,
  message: string,
  reason: string,
  status = 'FAILED_PRECONDITION',
) {
  return { error: { code, message, errors: [{ message, domain: 'global', reason }], status } };
}
