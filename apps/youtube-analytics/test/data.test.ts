/**
 * YouTube Data API v3 tools: channels, videos, search and playlists.
 */

import { describe, expect, it } from 'vitest';
import { DATA_BASE_URL } from '../src/lib/client.js';
import {
  CHANNEL_ID,
  channelsList,
  playlistItemsList,
  playlistItemsOfUploads,
  playlistsList,
  searchList,
  UPLOADS,
  VIDEO_A,
  VIDEO_B,
  video,
  videosList,
} from './fixtures.js';
import { callTool, jsonResponse, mockFetch, requestOf } from './harness.js';

const request = (fetchMock: Parameters<typeof requestOf>[0], path: string, n = 0) => {
  const { url, init } = requestOf(fetchMock, n);
  expect(`${url.origin}${url.pathname}`).toBe(`${DATA_BASE_URL}${path}`);
  expect(init.method).toBe('GET');
  return Object.fromEntries(url.searchParams);
};

describe('list-channels', () => {
  it('lists the account’s channels with numeric stats', async () => {
    const fetchMock = mockFetch(jsonResponse(channelsList));
    const result = await callTool('list-channels', {});
    expect(request(fetchMock, '/channels')).toMatchObject({
      part: 'snippet,statistics,contentDetails',
      mine: 'true',
    });
    const r = result.result as { channels: Array<Record<string, unknown>>; count: number };
    expect(r.count).toBe(1);
    expect(r.channels[0]).toMatchObject({
      id: CHANNEL_ID,
      title: 'Example Channel',
      handle: '@examplechannel',
      subscribers: 789,
      views: 123456,
      videoCount: 42,
      uploadsPlaylistId: UPLOADS,
      url: `https://www.youtube.com/channel/${CHANNEL_ID}`,
    });
  });

  it('reports a hidden subscriber count as null', async () => {
    const hidden = structuredClone(channelsList);
    hidden.items[0].statistics = {
      viewCount: '10',
      hiddenSubscriberCount: true,
      videoCount: '1',
    } as never;
    mockFetch(jsonResponse(hidden));
    const result = await callTool('list-channels', {});
    expect(
      (result.result as { channels: Array<Record<string, unknown>> }).channels[0].subscribers,
    ).toBeNull();
  });

  it('says so when the account has no channel', async () => {
    mockFetch(
      jsonResponse({
        kind: 'youtube#channelListResponse',
        pageInfo: { totalResults: 0, resultsPerPage: 5 },
      }),
    );
    const result = await callTool('list-channels', {});
    expect(result.result).toMatchObject({
      count: 0,
      note: expect.stringContaining('no YouTube channel'),
    });
  });
});

describe('list-videos', () => {
  it('reads the uploads playlist, then stats, in upload order', async () => {
    const fetchMock = mockFetch(
      jsonResponse(channelsList),
      jsonResponse(playlistItemsOfUploads),
      jsonResponse(videosList),
    );
    const result = await callTool('list-videos', { maxResults: 2, pageToken: 'CAEQAA' });
    expect(request(fetchMock, '/channels', 0)).toMatchObject({
      mine: 'true',
      part: 'snippet,contentDetails',
    });
    expect(request(fetchMock, '/playlistItems', 1)).toMatchObject({
      playlistId: UPLOADS,
      maxResults: '2',
      pageToken: 'CAEQAA',
      part: 'contentDetails',
    });
    expect(request(fetchMock, '/videos', 2).id).toBe(`${VIDEO_A},${VIDEO_B}`);

    const r = result.result as {
      videos: Array<Record<string, unknown>>;
      nextPageToken: string;
      totalResults: number;
    };
    expect(r.videos.map((v) => v.id)).toEqual([VIDEO_A, VIDEO_B]);
    expect(r.videos[0]).toMatchObject({
      title: 'First video',
      views: 1520,
      likes: 88,
      comments: 9,
      durationSeconds: 725,
      privacyStatus: 'public',
    });
    expect(r.nextPageToken).toBe('CAIQAA');
    expect(r.totalResults).toBe(42);
  });

  it('looks up another channel by id', async () => {
    const fetchMock = mockFetch(
      jsonResponse(channelsList),
      jsonResponse({ ...playlistItemsOfUploads, items: [] }),
    );
    const result = await callTool('list-videos', { channelId: CHANNEL_ID });
    expect(request(fetchMock, '/channels', 0)).toMatchObject({ id: CHANNEL_ID });
    expect(request(fetchMock, '/channels', 0).mine).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((result.result as Record<string, unknown>).count).toBe(0);
  });

  it('explains a missing channel', async () => {
    mockFetch(jsonResponse({ kind: 'youtube#channelListResponse', pageInfo: { totalResults: 0 } }));
    const result = await callTool('list-videos', {});
    expect(JSON.stringify(result.error)).toContain('[NOT_FOUND]');
  });

  it('rejects maxResults above 50 before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('list-videos', { maxResults: 100 });
    expect(JSON.stringify(result.error)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('search-videos', () => {
  it('searches own videos and decodes HTML entities in titles', async () => {
    const fetchMock = mockFetch(jsonResponse(searchList));
    const result = await callTool('search-videos', { query: 'tom & jerry', maxResults: 5 });
    expect(request(fetchMock, '/search')).toMatchObject({
      part: 'snippet',
      forMine: 'true',
      type: 'video',
      q: 'tom & jerry',
      order: 'relevance',
      maxResults: '5',
    });
    const r = result.result as { videos: Array<Record<string, unknown>>; nextPageToken: string };
    expect(r.videos[0]).toMatchObject({
      id: VIDEO_A,
      title: 'Tom & Jerry\'s "best" bits',
      description: "It's here",
      url: `https://www.youtube.com/watch?v=${VIDEO_A}`,
    });
    expect(r.nextPageToken).toBe('CBkQAA');
  });

  it('orders by date when there is no query', async () => {
    const fetchMock = mockFetch(jsonResponse({ ...searchList, items: [] }));
    await callTool('search-videos', {});
    const q = request(fetchMock, '/search');
    expect(q.order).toBe('date');
    expect(q.q).toBeUndefined();
  });

  it('rejects an unknown order before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('search-videos', { order: 'popular' });
    expect(JSON.stringify(result.error)).toContain('order must be one of');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('get-videos', () => {
  it('returns curated details and lists ids that were not found', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        ...videosList,
        items: [
          video(VIDEO_A, 'First video', {
            status: {
              privacyStatus: 'private',
              publishAt: '2026-11-01T10:00:00Z',
              madeForKids: false,
            },
          }),
        ],
      }),
    );
    const result = await callTool('get-videos', { ids: `${VIDEO_A}, ${VIDEO_B}` });
    expect(request(fetchMock, '/videos')).toMatchObject({
      id: `${VIDEO_A},${VIDEO_B}`,
      part: 'snippet,contentDetails,statistics,status',
    });
    const r = result.result as { videos: Array<Record<string, unknown>>; notFound: string[] };
    expect(r.videos[0]).toMatchObject({
      id: VIDEO_A,
      privacyStatus: 'private',
      publishAt: '2026-11-01T10:00:00Z',
      captions: false,
      tags: ['example', 'tutorial'],
      definition: 'hd',
    });
    expect(String(r.videos[0].description).length).toBeLessThanOrEqual(503);
    expect(r.notFound).toEqual([VIDEO_B]);
  });

  it.each([
    [{}],
    [{ ids: [] }],
    [{ ids: ['nope'] }],
    [{ ids: Array.from({ length: 51 }, (_, i) => `v${String(i).padStart(10, '0')}`) }],
  ])('rejects %j before any request', async (args) => {
    const fetchMock = mockFetch();
    const result = await callTool('get-videos', args);
    expect(JSON.stringify(result.error)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('list-playlists', () => {
  it('lists the account’s playlists', async () => {
    const fetchMock = mockFetch(jsonResponse(playlistsList));
    const result = await callTool('list-playlists', {});
    expect(request(fetchMock, '/playlists')).toMatchObject({
      mine: 'true',
      part: 'snippet,contentDetails,status',
      maxResults: '25',
    });
    const r = result.result as { playlists: Array<Record<string, unknown>> };
    expect(r.playlists[0]).toMatchObject({
      id: 'PLabcdefghijklmnopqrstuvwxyz012345',
      title: 'Tutorials',
      itemCount: 7,
      privacyStatus: 'public',
      url: 'https://www.youtube.com/playlist?list=PLabcdefghijklmnopqrstuvwxyz012345',
    });
    expect(r).not.toHaveProperty('nextPageToken');
  });

  it('lists another channel’s playlists by channelId', async () => {
    const fetchMock = mockFetch(jsonResponse(playlistsList));
    await callTool('list-playlists', { channelId: CHANNEL_ID });
    const q = request(fetchMock, '/playlists');
    expect(q.channelId).toBe(CHANNEL_ID);
    expect(q.mine).toBeUndefined();
  });
});

describe('list-playlist-videos', () => {
  it('lists the items in order, including private placeholders', async () => {
    const fetchMock = mockFetch(jsonResponse(playlistItemsList));
    const result = await callTool('list-playlist-videos', {
      playlistId: 'PLabcdefghijklmnopqrstuvwxyz012345',
    });
    expect(request(fetchMock, '/playlistItems')).toMatchObject({
      playlistId: 'PLabcdefghijklmnopqrstuvwxyz012345',
      maxResults: '50',
    });
    const r = result.result as { videos: Array<Record<string, unknown>> };
    expect(r.videos).toHaveLength(2);
    expect(r.videos[0]).toMatchObject({
      position: 0,
      videoId: VIDEO_A,
      ownerChannelTitle: 'Example Channel',
    });
    expect(r.videos[1]).toMatchObject({
      position: 1,
      privacyStatus: 'private',
      videoPublishedAt: null,
      ownerChannelTitle: null,
    });
  });

  it('passes a 404 through as NOT_FOUND', async () => {
    mockFetch(
      jsonResponse(
        {
          error: {
            code: 404,
            message:
              "The playlist identified with the request's <code>playlistId</code> parameter cannot be found.",
            errors: [{ reason: 'playlistNotFound' }],
          },
        },
        404,
      ),
    );
    const result = await callTool('list-playlist-videos', { playlistId: 'PLmissing' });
    const message = JSON.stringify(result.error);
    expect(message).toContain('[NOT_FOUND]');
    expect(message).toContain('playlistId parameter cannot be found');
  });

  it.each([[{}], [{ playlistId: '../x' }]])('rejects %j before any request', async (args) => {
    const fetchMock = mockFetch();
    const result = await callTool('list-playlist-videos', args);
    expect(JSON.stringify(result.error)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
