/**
 * Tool, client and health tests for the Granola Agent App.
 *
 * The network is mocked: every test queues the responses it expects and asserts the
 * request the app sent. Bodies follow the shapes of the Granola public API
 * (`/v1/notes`, `/v1/notes/{id}`, `/v1/folders`) with synthetic values.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  callTool,
  installationSecrets,
  jsonResponse,
  mockFetch,
  requestOf,
  runHealthCheck,
} from './harness.js';

const NOTE = {
  id: 'not_1d3tmYTlCICgjy',
  object: 'note',
  title: 'Quarterly planning',
  owner: { name: 'Ada Example', email: 'ada@example.com' },
  created_at: '2026-01-27T15:30:00Z',
  updated_at: '2026-01-27T16:45:00Z',
};

const SEGMENTS = Array.from({ length: 250 }, (_, i) => ({
  speaker: { source: i % 2 === 0 ? 'microphone' : 'speaker' },
  text: `Segment ${i}`,
  start_time: '2026-01-27T15:30:00Z',
  end_time: '2026-01-27T15:30:05Z',
}));

const NOTE_DETAIL = {
  ...NOTE,
  web_url: 'https://notes.granola.ai/d/1d3tmYTlCICgjy',
  calendar_event: {
    event_title: 'Quarterly planning',
    invitees: [{ email: 'grace@example.com' }],
    organiser: 'ada@example.com',
    calendar_event_id: 'evt_1',
    scheduled_start_time: '2026-01-27T15:30:00Z',
    scheduled_end_time: '2026-01-27T16:30:00Z',
  },
  attendees: [{ name: 'Grace Example', email: 'grace@example.com' }],
  folder_membership: [{ id: 'fol_4y6LduVdwSKC27', object: 'folder', name: 'Planning' }],
  summary_text: 'We agreed the roadmap.',
  summary_markdown: '## Summary\n\nWe agreed the roadmap.',
  transcript: null,
};

const errorOf = (res: Record<string, unknown>) =>
  (res.error as { message: string } | undefined)?.message ?? '';

describe('list-notes', () => {
  it('requests /v1/notes with the default page size and the API key', async () => {
    const fetchMock = mockFetch(jsonResponse({ notes: [NOTE], hasMore: true, cursor: 'cur_2' }));
    const res = await callTool('list-notes', {});

    expect(res.success).toBe(true);
    expect(res.result).toEqual({ notes: [NOTE], hasMore: true, cursor: 'cur_2' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = requestOf(fetchMock);
    expect(url.origin + url.pathname).toBe('https://public-api.granola.ai/v1/notes');
    expect(Object.fromEntries(url.searchParams)).toEqual({ page_size: '10' });
    expect(init.method).toBeUndefined(); // GET
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fake-granola-key');
  });

  it('passes the date filters and the cursor, and caps page_size at 30', async () => {
    const fetchMock = mockFetch(jsonResponse({ notes: [], hasMore: false }));
    const res = await callTool('list-notes', {
      created_after: '2026-01-01',
      created_before: '2026-02-01T00:00:00Z',
      updated_after: '2026-01-15',
      cursor: 'cur_2',
      page_size: 500,
    });

    expect(res.result).toEqual({ notes: [], hasMore: false });
    expect(Object.fromEntries(requestOf(fetchMock).url.searchParams)).toEqual({
      created_after: '2026-01-01',
      created_before: '2026-02-01T00:00:00Z',
      updated_after: '2026-01-15',
      cursor: 'cur_2',
      page_size: '30',
    });
  });

  it('raises page_size to at least 1', async () => {
    const fetchMock = mockFetch(jsonResponse({ notes: [], hasMore: false }));
    await callTool('list-notes', { page_size: 0 });
    expect(requestOf(fetchMock).url.searchParams.get('page_size')).toBe('1');
  });
});

describe('get-note', () => {
  it('requests the note without the transcript and drops the transcript field', async () => {
    const fetchMock = mockFetch(jsonResponse(NOTE_DETAIL));
    const res = await callTool('get-note', { noteId: 'not_1d3tmYTlCICgjy' });

    expect(res.success).toBe(true);
    const { transcript: _transcript, ...withoutTranscript } = NOTE_DETAIL;
    expect(res.result).toEqual(withoutTranscript);
    expect(res.result).not.toHaveProperty('transcript');
    const { url, init } = requestOf(fetchMock);
    expect(url.href).toBe('https://public-api.granola.ai/v1/notes/not_1d3tmYTlCICgjy');
    expect(init.method).toBeUndefined();
  });

  it('keeps the note id as one path segment, whatever it contains', async () => {
    for (const noteId of ['../folders', 'x?include=transcript', 'a/b']) {
      const fetchMock = mockFetch(jsonResponse({}, 404));
      await callTool('get-note', { noteId });
      const { url } = requestOf(fetchMock);
      expect(url.pathname).toBe(`/v1/notes/${encodeURIComponent(noteId)}`);
      expect(url.search).toBe('');
    }
  });
});

describe('get-transcript', () => {
  it('asks for the transcript and returns the first window of 100 segments', async () => {
    const fetchMock = mockFetch(jsonResponse({ ...NOTE_DETAIL, transcript: SEGMENTS }));
    const res = await callTool('get-transcript', { noteId: 'not_1d3tmYTlCICgjy' });

    expect(res.success).toBe(true);
    const result = res.result as Record<string, unknown>;
    expect(result).toMatchObject({
      noteId: 'not_1d3tmYTlCICgjy',
      title: 'Quarterly planning',
      totalSegments: 250,
      offset: 0,
      limit: 100,
      returned: 100,
      hasMore: true,
      nextOffset: 100,
    });
    expect(result.segments).toEqual(SEGMENTS.slice(0, 100));
    const { url } = requestOf(fetchMock);
    expect(url.href).toBe(
      'https://public-api.granola.ai/v1/notes/not_1d3tmYTlCICgjy?include=transcript',
    );
  });

  it('returns the last window without nextOffset and caps limit at 200', async () => {
    mockFetch(jsonResponse({ ...NOTE_DETAIL, transcript: SEGMENTS }));
    const res = await callTool('get-transcript', {
      noteId: 'not_1d3tmYTlCICgjy',
      offset: 100,
      limit: 1000,
    });

    const result = res.result as Record<string, unknown>;
    expect(result).toMatchObject({
      totalSegments: 250,
      offset: 100,
      limit: 200,
      returned: 150,
      hasMore: false,
    });
    expect(result.nextOffset).toBeUndefined();
    expect(result.segments).toEqual(SEGMENTS.slice(100));
  });

  it('clamps an offset past the end to an empty window', async () => {
    mockFetch(jsonResponse({ ...NOTE_DETAIL, transcript: SEGMENTS }));
    const res = await callTool('get-transcript', { noteId: 'not_1d3tmYTlCICgjy', offset: 999 });
    expect(res.result).toMatchObject({ offset: 250, returned: 0, hasMore: false, segments: [] });
  });

  it('returns an empty result when the note has no transcript', async () => {
    mockFetch(jsonResponse(NOTE_DETAIL));
    const res = await callTool('get-transcript', { noteId: 'not_1d3tmYTlCICgjy', limit: 5 });
    expect(res.result).toEqual({
      noteId: 'not_1d3tmYTlCICgjy',
      title: 'Quarterly planning',
      totalSegments: 0,
      offset: 0,
      limit: 5,
      hasMore: false,
      segments: [],
    });
  });

  it('keeps an oversized transcript window under 50,000 characters', async () => {
    const long = SEGMENTS.map((s) => ({ ...s, text: 'x'.repeat(150) }));
    mockFetch(jsonResponse({ ...NOTE_DETAIL, transcript: long }));
    const res = await callTool('get-transcript', { noteId: 'not_1d3tmYTlCICgjy' });
    expect(res.success).toBe(true);
    expect(JSON.stringify(res.result).length).toBeLessThan(50_000);
  });
});

describe('list-folders', () => {
  it('requests /v1/folders and returns the folders with the cursor', async () => {
    const folders = [
      { id: 'fol_4y6LduVdwSKC27', object: 'folder', name: 'Planning' },
      {
        id: 'fol_9a8LduVdwSKC31',
        object: 'folder',
        name: 'Q1',
        parent_folder_id: 'fol_4y6LduVdwSKC27',
      },
    ];
    const fetchMock = mockFetch(jsonResponse({ folders, hasMore: false }));
    const res = await callTool('list-folders', { cursor: 'cur_9', page_size: 25 });

    expect(res.success).toBe(true);
    expect(res.result).toEqual({ folders, hasMore: false });
    const { url, init } = requestOf(fetchMock);
    expect(url.origin + url.pathname).toBe('https://public-api.granola.ai/v1/folders');
    expect(Object.fromEntries(url.searchParams)).toEqual({ cursor: 'cur_9', page_size: '25' });
    expect(init.method).toBeUndefined();
  });
});

describe('errors', () => {
  for (const [tool, args] of [
    ['list-notes', {}],
    ['get-note', { noteId: 'not_1d3tmYTlCICgjy' }],
    ['get-transcript', { noteId: 'not_1d3tmYTlCICgjy' }],
    ['list-folders', {}],
  ] as const) {
    it(`${tool} fails without API_KEY before any request`, async () => {
      const fetchMock = mockFetch();
      delete installationSecrets.API_KEY;
      const res = await callTool(tool, args);
      expect(res.success).toBe(false);
      // The SDK rejects the call from the manifest's installationSecrets, before the handler runs.
      expect(errorOf(res)).toBe(
        'Missing required Installation secret(s): API_KEY. Configure them for this installation before using app.granola.',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it('reports a 401 as an authentication failure without the key', async () => {
    mockFetch(jsonResponse({ error: 'unauthorized' }, 401));
    const res = await callTool('list-notes', {});
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('Granola API authentication failed (401)');
    expect(errorOf(res)).not.toContain('fake-granola-key');
  });

  it('reports a 404 with the path', async () => {
    mockFetch(jsonResponse({ error: 'not found' }, 404));
    const res = await callTool('get-note', { noteId: 'not_missing' });
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('404 Not Found. Path: /v1/notes/not_missing');
  });

  it('reports a 429 with the rate limits and does not retry', async () => {
    const fetchMock = mockFetch(jsonResponse({ error: 'rate limited' }, 429));
    const res = await callTool('list-folders', {});
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('rate limit exceeded (429)');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports any other status with the response body', async () => {
    mockFetch(new Response('upstream exploded', { status: 500, statusText: 'Server Error' }));
    const res = await callTool('list-notes', {});
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('Granola API error: 500 Server Error. upstream exploded');
  });

  it('reports a timeout when the request is aborted', async () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    const res = await callTool('list-notes', {});
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('Granola API request timed out after 30000ms');
  });
});

describe('health check', () => {
  it('is ready when the API answers, and probes with page_size=1', async () => {
    const fetchMock = mockFetch(jsonResponse({ notes: [NOTE], hasMore: true }));
    const health = await runHealthCheck();

    expect(health.status).toBe('ready');
    expect(health.message).toBe('Connected. 1 note(s) accessible (hasMore=true).');
    const { url, init } = requestOf(fetchMock);
    expect(url.href).toBe('https://public-api.granola.ai/v1/notes?page_size=1');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fake-granola-key');
  });

  it('is not_ready with MISSING_SECRET when there is no API key, without any request', async () => {
    const fetchMock = mockFetch();
    delete installationSecrets.API_KEY;
    const health = await runHealthCheck();

    expect(health.status).toBe('not_ready');
    expect((health.issues as Array<{ code: string }>)[0].code).toBe('MISSING_SECRET');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is not_ready with AUTH_EXPIRED when the key is rejected', async () => {
    mockFetch(jsonResponse({ error: 'unauthorized' }, 401));
    const health = await runHealthCheck();

    expect(health.status).toBe('not_ready');
    expect(health.message).toBe('Granola API key is invalid or expired');
    expect((health.issues as Array<{ code: string }>)[0].code).toBe('AUTH_EXPIRED');
  });

  it('is not_ready with DEPENDENCY_UNAVAILABLE when the API fails', async () => {
    mockFetch(new Response('down', { status: 503, statusText: 'Service Unavailable' }));
    const health = await runHealthCheck();

    expect(health.status).toBe('not_ready');
    expect((health.issues as Array<{ code: string }>)[0].code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(health.message).toContain('503');
  });

  it('is not_ready with DEPENDENCY_UNAVAILABLE when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const health = await runHealthCheck();

    expect(health.status).toBe('not_ready');
    expect(health.message).toBe('Granola API error: fetch failed');
    expect((health.issues as Array<{ code: string }>)[0].code).toBe('DEPENDENCY_UNAVAILABLE');
  });
});
