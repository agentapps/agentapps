/**
 * Tool, client and health tests for the Notion Agent App. The API is mocked (fetch).
 *
 * The app talks to Notion through `@notionhq/client`, which is given a wrapper around the
 * global `fetch`; the tests stub `fetch`, so every assertion is on the HTTP request that
 * would leave the process. Mock bodies follow the shapes of the Notion API reference
 * (version 2026-03-11: `in_trash`, databases with `data_sources`, `data_source_id`
 * parents), with synthetic values.
 *
 * The data-source and schema caches in src/tools/ live for the whole process, so every
 * test that touches a database uses its own database id.
 */

import { describe, expect, it } from 'vitest';
import {
  callTool,
  installationSecrets,
  jsonResponse,
  type Message,
  mockFetch,
  notionError,
  refresh,
  requestLines,
  requestOf,
  runHealthCheck,
  secretUpdates,
  systemSecrets,
} from './harness.js';

const API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2026-03-11';

const PAGE = '11111111-1111-4111-8111-111111111111';
const PAGE_2 = '11111111-1111-4111-8111-222222222222';
const PARENT_PAGE = '22222222-2222-4222-8222-222222222222';
const BLOCK = '33333333-3333-4333-8333-333333333333';
const BLOCK_2 = '33333333-3333-4333-8333-444444444444';
const USER = '44444444-4444-4444-8444-444444444444';
const BOT = '44444444-4444-4444-8444-555555555555';
const COMMENT = '55555555-5555-4555-8555-555555555555';
const DISCUSSION = '66666666-6666-4666-8666-666666666666';
const UPLOAD = '77777777-7777-4777-8777-777777777777';

/** A database id and its single data source id, different for every `n`. */
function dbIds(n: number): { db: string; ds: string } {
  const tail = String(n).padStart(12, '0');
  return {
    db: `aaaaaaaa-aaaa-4aaa-8aaa-${tail}`,
    ds: `bbbbbbbb-bbbb-4bbb-8bbb-${tail}`,
  };
}

const richText = (content: string) => [
  {
    type: 'text',
    text: { content, link: null },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default',
    },
    plain_text: content,
    href: null,
  },
];

function pageBody(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    object: 'page',
    id,
    created_time: '2026-01-02T03:04:00.000Z',
    last_edited_time: '2026-01-03T03:04:00.000Z',
    created_by: { object: 'user', id: USER },
    last_edited_by: { object: 'user', id: USER },
    cover: null,
    icon: null,
    parent: { type: 'page_id', page_id: PARENT_PAGE },
    in_trash: false,
    is_locked: false,
    properties: { title: { id: 'title', type: 'title', title: richText(title) } },
    url: `https://www.notion.so/${id.replace(/-/g, '')}`,
    public_url: null,
    ...extra,
  };
}

/** A database row: a page whose parent is a data source. */
function rowBody(id: string, ids: { db: string; ds: string }, name: string) {
  return pageBody(id, name, {
    parent: { type: 'data_source_id', data_source_id: ids.ds, database_id: ids.db },
    properties: {
      Name: { id: 'title', type: 'title', title: richText(name) },
      Status: { id: 'st', type: 'status', status: { id: 's1', name: 'Done', color: 'green' } },
      Tags: { id: 'tg', type: 'multi_select', multi_select: [{ id: 't1', name: 'urgent' }] },
    },
  });
}

function databaseBody(ids: { db: string; ds: string }, title = 'Tasks') {
  return {
    object: 'database',
    id: ids.db,
    title: richText(title),
    description: [],
    parent: { type: 'page_id', page_id: PARENT_PAGE },
    is_inline: false,
    in_trash: false,
    is_locked: false,
    created_time: '2026-01-02T03:04:00.000Z',
    last_edited_time: '2026-01-03T03:04:00.000Z',
    data_sources: [{ id: ids.ds, name: title }],
    icon: null,
    cover: null,
    url: `https://www.notion.so/${ids.db.replace(/-/g, '')}`,
    public_url: null,
  };
}

function dataSourceBody(ids: { db: string; ds: string }) {
  return {
    object: 'data_source',
    id: ids.ds,
    parent: { type: 'database_id', database_id: ids.db },
    properties: {
      Name: { id: 'title', name: 'Name', type: 'title', title: {} },
      Status: { id: 'st', name: 'Status', type: 'status', status: { options: [] } },
      Tags: { id: 'tg', name: 'Tags', type: 'multi_select', multi_select: { options: [] } },
      Created: { id: 'cr', name: 'Created', type: 'created_time', created_time: {} },
    },
  };
}

function blockBody(id: string, text: string, extra: Record<string, unknown> = {}) {
  return {
    object: 'block',
    id,
    parent: { type: 'page_id', page_id: PAGE },
    created_time: '2026-01-02T03:04:00.000Z',
    last_edited_time: '2026-01-03T03:04:00.000Z',
    has_children: false,
    in_trash: false,
    type: 'paragraph',
    paragraph: { rich_text: richText(text), color: 'default', icon: null },
    ...extra,
  };
}

const list = (results: unknown[], extra: Record<string, unknown> = {}) => ({
  object: 'list',
  results,
  next_cursor: null,
  has_more: false,
  ...extra,
});

const personBody = {
  object: 'user',
  id: USER,
  type: 'person',
  name: 'Ada Example',
  avatar_url: null,
  person: { email: 'ada@example.com' },
};
const botBody = {
  object: 'user',
  id: BOT,
  type: 'bot',
  name: 'Test Integration',
  avatar_url: null,
  bot: { owner: { type: 'workspace', workspace: true }, workspace_name: 'Example' },
};

function commentBody(text: string) {
  return {
    object: 'comment',
    id: COMMENT,
    parent: { type: 'page_id', page_id: PAGE },
    discussion_id: DISCUSSION,
    created_time: '2026-01-02T03:04:00.000Z',
    last_edited_time: '2026-01-03T03:04:00.000Z',
    created_by: { object: 'user', id: USER },
    rich_text: richText(text),
  };
}

const errorText = (result: Message) => String((result.error as { message?: string })?.message);
const ok = (result: Message) => {
  expect(result.success, errorText(result)).toBe(true);
  return result.result as any;
};

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

describe('health', () => {
  it('calls GET /users/me with the token and reports the connection', async () => {
    const fetchMock = mockFetch(jsonResponse(botBody));
    const health = await runHealthCheck();
    expect(health.message).toBe('Notion connected');
    // What the code does today: the app answers `ok`, which is not a protocol health status.
    expect(health.status).toBe('ok');
    const { url, method, headers } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`GET ${API}/users/me`);
    expect(headers.get('authorization')).toBe('Bearer fake-access-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Bug: src/app.ts returns `status: 'ok'`; the protocol's HealthStatusSchema only has
  // 'ready' | 'not_ready' | 'degraded'.
  it.todo('reports `ready` (not `ok`) when the token works');

  it('reports degraded without any request when the account is not connected', async () => {
    const fetchMock = mockFetch();
    delete installationSecrets.ACCESS_TOKEN;
    const health = await runHealthCheck();
    expect(health.status).toBe('degraded');
    expect(health.message).toBe('Notion account not connected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The protocol's status for "needs the user to connect" is `not_ready` with an issue.
  it.todo('reports `not_ready` with an AUTH_REQUIRED issue when the account is not connected');

  it('reports degraded when Notion cannot be reached', async () => {
    const fetchMock = mockFetch();
    const health = await runHealthCheck();
    expect(health.status).toBe('degraded');
    expect(String(health.message)).toContain('Notion API error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports degraded when Notion rejects the request', async () => {
    mockFetch(notionError(403, 'restricted_resource', 'Insufficient permissions.'));
    const health = await runHealthCheck();
    // The SDK's own error is not a NotionApiError, so the health check takes its generic branch.
    expect(health.status).toBe('degraded');
    expect(String(health.message)).toContain('Insufficient permissions.');
  });

  it('answers `error` when the token is rejected and cannot be refreshed', async () => {
    const fetchMock = mockFetch(
      notionError(401, 'unauthorized', 'API token is invalid.'),
      jsonResponse({ error: 'invalid_grant' }, 400),
    );
    const health = await runHealthCheck();
    // What the code does today: `error` is not a protocol health status either.
    expect(health.status).toBe('error');
    expect(String(health.message)).toContain('Notion token refresh failed (400)');
    expect(requestLines(fetchMock)).toEqual(['GET /v1/users/me', 'POST /v1/oauth/token']);
  });
  it.todo('reports `not_ready` (not `error`) when the token is rejected and cannot be refreshed');

  it('never puts a secret in the health message', async () => {
    mockFetch(notionError(401, 'unauthorized', 'API token is invalid.'), jsonResponse({}, 400));
    const health = await runHealthCheck();
    const text = JSON.stringify(health);
    expect(text).not.toContain('fake-access-token');
    expect(text).not.toContain('fake-refresh-token');
    expect(text).not.toContain('fake-client-secret');
  });
});

// ---------------------------------------------------------------------------
// Client: headers, auth, refresh, errors
// ---------------------------------------------------------------------------

describe('client', () => {
  it('sends the bearer token and the pinned Notion-Version', async () => {
    const fetchMock = mockFetch(jsonResponse(botBody));
    ok(await callTool('get-me', {}));
    const { headers } = requestOf(fetchMock);
    expect(headers.get('authorization')).toBe('Bearer fake-access-token');
    expect(headers.get('notion-version')).toBe(NOTION_VERSION);
  });

  it('fails with AUTH_REQUIRED and no request when there is no access token', async () => {
    const fetchMock = mockFetch();
    delete installationSecrets.ACCESS_TOKEN;
    const result = await callTool('get-me', {});
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[AUTH_REQUIRED]');
    expect(errorText(result)).toContain('Notion account not connected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('on a 401 refreshes the token itself, stores it and replays the request', async () => {
    const fetchMock = mockFetch(
      notionError(401, 'unauthorized', 'API token is invalid.'),
      jsonResponse({
        access_token: 'fake-new-access-token',
        refresh_token: 'fake-new-refresh-token',
        expires_in: 3600,
      }),
      jsonResponse(botBody),
    );
    const me = ok(await callTool('get-me', {}));
    expect(me.id).toBe(BOT);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refreshCall = requestOf(fetchMock, 1);
    expect(`${refreshCall.method} ${refreshCall.url}`).toBe(`POST ${API}/oauth/token`);
    expect(refreshCall.headers.get('authorization')).toBe(
      `Basic ${Buffer.from('fake-client-id:fake-client-secret').toString('base64')}`,
    );
    const form = refreshCall.rawBody as URLSearchParams;
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('fake-refresh-token');

    const replay = requestOf(fetchMock, 2);
    expect(`${replay.method} ${replay.url}`).toBe(`GET ${API}/users/me`);
    expect(replay.headers.get('authorization')).toBe('Bearer fake-new-access-token');

    expect(secretUpdates).toHaveLength(1);
    expect(secretUpdates[0].ACCESS_TOKEN).toBe('fake-new-access-token');
    expect(secretUpdates[0].REFRESH_TOKEN).toBe('fake-new-refresh-token');
    expect(Number.isNaN(Date.parse(secretUpdates[0].EXPIRY_DATE))).toBe(false);
    // The app refreshes with the client secret itself; it does not ask the host to.
    expect(refresh.calls).toBe(0);
  });

  it('stops after one refresh when the replay is also a 401', async () => {
    const fetchMock = mockFetch(
      notionError(401, 'unauthorized', 'API token is invalid.'),
      jsonResponse({ access_token: 'fake-new-access-token' }),
      notionError(401, 'unauthorized', 'API token is invalid.'),
    );
    const result = await callTool('get-me', {});
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[AUTH_EXPIRED]');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports AUTH_EXPIRED when Notion rejects the refresh token', async () => {
    const fetchMock = mockFetch(
      notionError(401, 'unauthorized', 'API token is invalid.'),
      jsonResponse({ error: 'invalid_grant' }, 400),
    );
    const result = await callTool('get-me', {});
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[AUTH_EXPIRED]');
    expect(errorText(result)).toContain('Notion token refresh failed (400)');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(secretUpdates).toHaveLength(0);
  });

  it('reports SYSTEM_CONFIG_MISSING on a 401 when the OAuth client is not configured', async () => {
    const fetchMock = mockFetch(notionError(401, 'unauthorized', 'API token is invalid.'));
    delete systemSecrets.CLIENT_ID;
    delete systemSecrets.CLIENT_SECRET;
    const result = await callTool('get-me', {});
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[SYSTEM_CONFIG_MISSING]');
    expect(errorText(result)).toContain('CLIENT_ID and CLIENT_SECRET');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The message does not name the command that sets them
  // (`agentapps config app.notion CLIENT_ID:... CLIENT_SECRET:...`).
  it.todo('names the `agentapps config app.notion` command when the OAuth client is missing');

  it('reports AUTH_REQUIRED on a 401 when there is no refresh token', async () => {
    const fetchMock = mockFetch(notionError(401, 'unauthorized', 'API token is invalid.'));
    delete installationSecrets.REFRESH_TOKEN;
    const result = await callTool('get-me', {});
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[AUTH_REQUIRED]');
    expect(errorText(result)).toContain('No Notion refresh token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [404, 'object_not_found', 'Could not find page.', '[NOT_FOUND]'],
    [403, 'restricted_resource', 'Insufficient permissions.', '[PERMISSION_DENIED]'],
    [400, 'validation_error', 'body failed validation.', '[VALIDATION_ERROR]'],
    [409, 'conflict_error', 'Conflict occurred while saving.', '[CONFLICT]'],
  ])('maps a %i %s to %s and keeps Notion’s message', async (status, code, message, tag) => {
    const fetchMock = mockFetch(notionError(status, code, message));
    const result = await callTool('get-page', { pageId: PAGE });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain(tag);
    expect(errorText(result)).toContain(message);
    expect(errorText(result)).not.toContain('fake-access-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a read after a 429 and succeeds', async () => {
    const fetchMock = mockFetch(
      notionError(429, 'rate_limited', 'Rate limited.'),
      jsonResponse(pageBody(PAGE, 'Roadmap')),
    );
    const page = ok(await callTool('get-page', { pageId: PAGE }));
    expect(page.title).toBe('Roadmap');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a create after a 429', async () => {
    const fetchMock = mockFetch(notionError(429, 'rate_limited', 'Rate limited.'));
    const result = await callTool('create-comment', { pageId: PAGE, text: 'Hi' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[RATE_LIMITED]');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure without retrying it', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('get-page', { pageId: PAGE });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('unexpected fetch in test');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

describe('search', () => {
  it('posts the query, filter, sort and page size, and returns curated rows', async () => {
    const ids = dbIds(1);
    const fetchMock = mockFetch(
      jsonResponse(
        list([pageBody(PAGE, 'Roadmap'), databaseBody(ids)], {
          has_more: true,
          next_cursor: 'cursor-2',
        }),
      ),
    );
    const out = ok(
      await callTool('search', {
        query: 'road',
        filter: 'page',
        sort: 'last_edited_time',
        limit: 500,
        startCursor: 'cursor-1',
      }),
    );
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`POST ${API}/search`);
    expect(body).toEqual({
      query: 'road',
      page_size: 100,
      filter: { value: 'page', property: 'object' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      start_cursor: 'cursor-1',
    });
    expect(out.total).toBe(2);
    expect(out.hasMore).toBe(true);
    expect(out.nextCursor).toBe('cursor-2');
    expect(out.results[0]).toEqual({
      id: PAGE,
      object: 'page',
      url: `https://www.notion.so/${PAGE.replace(/-/g, '')}`,
      title: 'Roadmap',
      icon: null,
      cover: null,
      createdTime: '2026-01-02T03:04:00.000Z',
      lastEditedTime: '2026-01-03T03:04:00.000Z',
      parentType: 'page',
      parentId: PARENT_PAGE,
      inTrash: false,
      archived: false,
    });
    expect(out.results[1]).toMatchObject({ id: ids.db, object: 'database', title: 'Tasks' });
  });

  it('defaults to 50 results and sends no filter or sort', async () => {
    const fetchMock = mockFetch(jsonResponse(list([])));
    const out = ok(await callTool('search', { query: '' }));
    expect(requestOf(fetchMock).body).toEqual({ query: '', page_size: 50 });
    expect(out).toEqual({ results: [], total: 0, hasMore: false, nextCursor: null });
  });
});

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

describe('pages', () => {
  it('get-page reads a page by id and returns the curated shape', async () => {
    const fetchMock = mockFetch(jsonResponse(pageBody(PAGE, 'Roadmap')));
    const page = ok(await callTool('get-page', { pageId: PAGE }));
    const { url, method } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`GET ${API}/pages/${PAGE}`);
    expect(page).toMatchObject({
      id: PAGE,
      title: 'Roadmap',
      parentType: 'page',
      parentId: PARENT_PAGE,
      inTrash: false,
      properties: { title: 'Roadmap' },
    });
  });

  it('get-page accepts a Notion share URL and ignores the view id', async () => {
    const fetchMock = mockFetch(jsonResponse(pageBody(PAGE, 'Roadmap')));
    const bare = PAGE.replace(/-/g, '');
    ok(
      await callTool('get-page', {
        pageId: `https://www.notion.so/acme/Roadmap-${bare}?v=99999999999949998999999999999999`,
      }),
    );
    expect(requestOf(fetchMock).url.pathname).toBe(`/v1/pages/${PAGE}`);
  });

  it('get-page rejects an id that is not a UUID before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('get-page', { pageId: 'not-an-id' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('Invalid pageId');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('get-page-markdown reads the markdown endpoint', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        object: 'page_markdown',
        id: PAGE,
        markdown: '# Roadmap\n',
        truncated: false,
      }),
    );
    const out = ok(await callTool('get-page-markdown', { pageId: PAGE, includeTranscript: true }));
    const { url, method } = requestOf(fetchMock);
    expect(method).toBe('GET');
    expect(url.pathname).toBe(`/v1/pages/${PAGE}/markdown`);
    expect(url.searchParams.get('include_transcript')).toBe('true');
    expect(out).toEqual({ markdown: '# Roadmap\n' });
  });

  it('create-page under a page posts the parent and the title', async () => {
    const fetchMock = mockFetch(jsonResponse(pageBody(PAGE, 'Notes')));
    const page = ok(
      await callTool('create-page', { parentId: PARENT_PAGE, parentType: 'page', title: 'Notes' }),
    );
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`POST ${API}/pages`);
    expect(body).toEqual({
      parent: { page_id: PARENT_PAGE },
      properties: { title: [{ text: { content: 'Notes' } }] },
    });
    expect(page).toMatchObject({ id: PAGE, title: 'Notes', parentType: 'page' });
    expect(page.properties).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('create-page under a database resolves the data source and the schema first', async () => {
    const ids = dbIds(2);
    const fetchMock = mockFetch(
      jsonResponse(databaseBody(ids)),
      jsonResponse(dataSourceBody(ids)),
      jsonResponse(rowBody(PAGE, ids, 'Untitled')),
    );
    ok(
      await callTool('create-page', {
        parentId: ids.db,
        parentType: 'database',
        title: 'Ship it',
        propertiesSimple: { Status: 'Done', Tags: ['urgent'] },
      }),
    );
    expect(requestLines(fetchMock)).toEqual([
      `GET /v1/databases/${ids.db}`,
      `GET /v1/data_sources/${ids.ds}`,
      'POST /v1/pages',
    ]);
    expect(requestOf(fetchMock, 2).body).toEqual({
      parent: { data_source_id: ids.ds },
      properties: {
        Status: { status: { name: 'Done' } },
        Tags: { multi_select: [{ name: 'urgent' }] },
        Name: { title: [{ text: { content: 'Ship it' } }] },
      },
    });
  });

  it('create-page rejects propertiesSimple under a page before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('create-page', {
      parentId: PARENT_PAGE,
      parentType: 'page',
      propertiesSimple: { Status: 'Done' },
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('propertiesSimple is only valid when parentType=database');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('update-page patches raw properties and sends archived as in_trash', async () => {
    const fetchMock = mockFetch(jsonResponse(pageBody(PAGE, 'Roadmap', { in_trash: true })));
    const properties = { title: { title: [{ text: { content: 'Roadmap' } }] } };
    const page = ok(await callTool('update-page', { pageId: PAGE, properties, archived: true }));
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`PATCH ${API}/pages/${PAGE}`);
    expect(body).toEqual({ properties, in_trash: true });
    expect(page).toMatchObject({ id: PAGE, inTrash: true, archived: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('update-page does not classify an API error on the final PATCH', async () => {
    mockFetch(notionError(404, 'object_not_found', 'Could not find page.'));
    const result = await callTool('update-page', { pageId: PAGE, archived: true });
    expect(result.success).toBe(false);
    // What the code does today: `client.pages.update` is not wrapped (src/tools/update-page.ts),
    // so the message carries no [NOT_FOUND] prefix, unlike every other tool.
    expect(errorText(result)).toContain('Could not find page.');
    expect(errorText(result)).not.toContain('[NOT_FOUND]');
  });
  it.todo('update-page prefixes an API error with its [CODE], like the other tools');

  it('update-page-markdown replaces the whole body by default', async () => {
    const fetchMock = mockFetch(jsonResponse({ object: 'page_markdown', id: PAGE, markdown: '' }));
    const out = ok(await callTool('update-page-markdown', { pageId: PAGE, markdown: '# New\n' }));
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`PATCH ${API}/pages/${PAGE}/markdown`);
    expect(body).toEqual({
      type: 'replace_content',
      replace_content: { new_str: '# New\n', allow_deleting_content: true },
    });
    expect(out).toEqual({ pageId: PAGE, mode: 'replace' });
  });

  it('update-page-markdown appends after a block and applies edits', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ object: 'page_markdown', id: PAGE, markdown: '' }),
      jsonResponse({ object: 'page_markdown', id: PAGE, markdown: '' }),
    );
    ok(
      await callTool('update-page-markdown', {
        pageId: PAGE,
        mode: 'append',
        markdown: 'More',
        afterBlockId: BLOCK,
      }),
    );
    expect(requestOf(fetchMock, 0).body).toEqual({
      type: 'insert_content',
      insert_content: { content: 'More', after: BLOCK },
    });
    ok(
      await callTool('update-page-markdown', {
        pageId: PAGE,
        mode: 'edit',
        edits: [{ oldStr: 'a', newStr: 'b' }],
        allowDeletingContent: false,
      }),
    );
    expect(requestOf(fetchMock, 1).body).toEqual({
      type: 'update_content',
      update_content: {
        content_updates: [{ old_str: 'a', new_str: 'b', replace_all_matches: false }],
        allow_deleting_content: false,
      },
    });
  });

  it('update-page-markdown rejects a missing markdown or empty edits before any request', async () => {
    const fetchMock = mockFetch();
    const noMarkdown = await callTool('update-page-markdown', { pageId: PAGE });
    expect(errorText(noMarkdown)).toContain('replace mode requires `markdown: string`');
    const noEdits = await callTool('update-page-markdown', { pageId: PAGE, mode: 'edit' });
    expect(errorText(noEdits)).toContain('edit mode requires `edits');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('set-page-icon patches an emoji or an external icon', async () => {
    const fetchMock = mockFetch(
      jsonResponse(pageBody(PAGE, 'Roadmap', { icon: { type: 'emoji', emoji: '🚀' } })),
      jsonResponse(pageBody(PAGE, 'Roadmap')),
    );
    const page = ok(
      await callTool('set-page-icon', { pageId: PAGE, iconType: 'emoji', icon: '🚀' }),
    );
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`PATCH ${API}/pages/${PAGE}`);
    expect(body).toEqual({ icon: { type: 'emoji', emoji: '🚀' } });
    expect(page.icon).toEqual({ type: 'emoji', value: '🚀' });

    ok(
      await callTool('set-page-icon', {
        pageId: PAGE,
        iconType: 'external',
        icon: 'https://example.com/i.png',
      }),
    );
    expect(requestOf(fetchMock, 1).body).toEqual({
      icon: { type: 'external', external: { url: 'https://example.com/i.png' } },
    });
  });

  it('set-page-cover patches an external cover', async () => {
    const cover = { type: 'external', external: { url: 'https://example.com/c.png' } };
    const fetchMock = mockFetch(jsonResponse(pageBody(PAGE, 'Roadmap', { cover })));
    const page = ok(
      await callTool('set-page-cover', { pageId: PAGE, coverUrl: 'https://example.com/c.png' }),
    );
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`PATCH ${API}/pages/${PAGE}`);
    expect(body).toEqual({ cover });
    expect(page.cover).toEqual({ type: 'external', value: 'https://example.com/c.png' });
  });

  it('set-page-icon and set-page-cover reject a bad page id before any request', async () => {
    const fetchMock = mockFetch();
    const icon = await callTool('set-page-icon', { pageId: 'x', iconType: 'emoji', icon: '🚀' });
    expect(errorText(icon)).toContain('Invalid pageId');
    const cover = await callTool('set-page-cover', { pageId: 'x', coverUrl: 'https://e.com/c' });
    expect(errorText(cover)).toContain('Invalid pageId');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('duplicate-page reads the page and its blocks, creates the copy and appends the blocks', async () => {
    const fetchMock = mockFetch(
      jsonResponse(pageBody(PAGE, 'Roadmap', { icon: { type: 'emoji', emoji: '🚀' } })),
      jsonResponse(list([blockBody(BLOCK, 'Hello')])),
      jsonResponse(pageBody(PAGE_2, 'Copy of Roadmap')),
      jsonResponse(list([blockBody(BLOCK_2, 'Hello')])),
    );
    const out = ok(await callTool('duplicate-page', { pageId: PAGE }));
    expect(requestLines(fetchMock)).toEqual([
      `GET /v1/pages/${PAGE}`,
      `GET /v1/blocks/${PAGE}/children?page_size=100`,
      'POST /v1/pages',
      `PATCH /v1/blocks/${PAGE_2}/children`,
    ]);
    const create = requestOf(fetchMock, 2).body;
    expect(create.parent).toEqual({ type: 'page_id', page_id: PARENT_PAGE });
    expect(create.properties.title).toEqual([{ text: { content: 'Copy of Roadmap' } }]);
    expect(create.icon).toEqual({ type: 'emoji', emoji: '🚀' });
    // Read-only block metadata and null fields are stripped before the append.
    expect(requestOf(fetchMock, 3).body).toEqual({
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: richText('Hello'), color: 'default' },
        },
      ],
    });
    expect(out.blocksCopied).toBe(1);
    expect(out.sourcePage).toMatchObject({ id: PAGE, title: 'Roadmap' });
    expect(out.duplicate).toMatchObject({ id: PAGE_2, title: 'Copy of Roadmap' });
  });
});

// ---------------------------------------------------------------------------
// Databases
// ---------------------------------------------------------------------------

describe('databases', () => {
  it('get-database reads the database and joins the schema of its data source', async () => {
    const ids = dbIds(10);
    const fetchMock = mockFetch(
      jsonResponse(databaseBody(ids)),
      jsonResponse(databaseBody(ids)),
      jsonResponse(dataSourceBody(ids)),
    );
    const db = ok(await callTool('get-database', { databaseId: ids.db }));
    expect(requestLines(fetchMock)).toEqual([
      `GET /v1/databases/${ids.db}`,
      `GET /v1/databases/${ids.db}`,
      `GET /v1/data_sources/${ids.ds}`,
    ]);
    expect(db).toMatchObject({
      id: ids.db,
      title: 'Tasks',
      isInline: false,
      isMultiSource: false,
      dataSources: [{ id: ids.ds, name: 'Tasks' }],
      schema: {
        Name: { type: 'title', name: 'Name' },
        Status: { type: 'status', name: 'Status' },
      },
    });
  });

  it('query-database resolves the data source and posts filter, sorts and page size', async () => {
    const ids = dbIds(11);
    const fetchMock = mockFetch(
      jsonResponse(databaseBody(ids)),
      jsonResponse(list([rowBody(PAGE, ids, 'Ship it')])),
    );
    const filter = { property: 'Status', status: { equals: 'Done' } };
    const sorts = [{ property: 'Name', direction: 'ascending' }];
    const out = ok(
      await callTool('query-database', {
        databaseId: ids.db,
        filter,
        sorts,
        limit: 10,
        propertyNames: ['Status', 'Missing'],
      }),
    );
    expect(requestLines(fetchMock)).toEqual([
      `GET /v1/databases/${ids.db}`,
      `POST /v1/data_sources/${ids.ds}/query`,
    ]);
    expect(requestOf(fetchMock, 1).body).toEqual({ filter, sorts, page_size: 10 });
    expect(out.total).toBe(1);
    expect(out.hasMore).toBe(false);
    expect(out.results[0]).toMatchObject({
      id: PAGE,
      title: 'Ship it',
      parentType: 'data_source',
      parentId: ids.ds,
      databaseId: ids.db,
      // The title is always kept; a whitelisted column the row lacks comes back as null.
      properties: { Name: 'Ship it', Status: 'Done', Missing: null },
    });
    expect(out.results[0].properties.Tags).toBeUndefined();
  });

  it('query-database with a dataSourceId skips the database lookup', async () => {
    const ids = dbIds(12);
    const fetchMock = mockFetch(jsonResponse(list([])));
    ok(await callTool('query-database', { dataSourceId: ids.ds, startCursor: 'c1' }));
    expect(requestLines(fetchMock)).toEqual([`POST /v1/data_sources/${ids.ds}/query`]);
    expect(requestOf(fetchMock).body).toEqual({ page_size: 50, start_cursor: 'c1' });
  });

  it('query-database needs a databaseId or a dataSourceId', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('query-database', {});
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('requires either databaseId or dataSourceId');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('create-database posts the parent page, the title and the initial schema', async () => {
    const ids = dbIds(13);
    const fetchMock = mockFetch(jsonResponse(databaseBody(ids, 'Bugs')));
    const properties = { Name: { title: {} }, Done: { checkbox: {} } };
    const db = ok(
      await callTool('create-database', { parentPageId: PARENT_PAGE, title: 'Bugs', properties }),
    );
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`POST ${API}/databases`);
    expect(body).toEqual({
      parent: { type: 'page_id', page_id: PARENT_PAGE },
      title: [{ text: { content: 'Bugs' } }],
      initial_data_source: { properties },
    });
    expect(db).toMatchObject({ id: ids.db, title: 'Bugs', parentId: PARENT_PAGE });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('create-database turns a relation’s database_id into its data_source_id', async () => {
    const target = dbIds(14);
    const created = dbIds(15);
    const fetchMock = mockFetch(
      jsonResponse(databaseBody(target)),
      jsonResponse(databaseBody(created)),
    );
    ok(
      await callTool('create-database', {
        parentPageId: PARENT_PAGE,
        title: 'Bugs',
        properties: { Name: { title: {} }, Epic: { relation: { database_id: target.db } } },
      }),
    );
    expect(requestLines(fetchMock)).toEqual([
      `GET /v1/databases/${target.db}`,
      'POST /v1/databases',
    ]);
    expect(requestOf(fetchMock, 1).body.initial_data_source.properties.Epic).toEqual({
      relation: { data_source_id: target.ds, type: 'single_property', single_property: {} },
    });
  });

  it('update-database-schema patches the data source and re-reads the database', async () => {
    const ids = dbIds(16);
    const fetchMock = mockFetch(
      jsonResponse(databaseBody(ids)),
      jsonResponse(dataSourceBody(ids)),
      jsonResponse(databaseBody(ids, 'Tasks v2')),
    );
    const properties = { Priority: { select: { options: [{ name: 'High' }] } }, Tags: null };
    const db = ok(
      await callTool('update-database-schema', {
        databaseId: ids.db,
        properties,
        title: 'Tasks v2',
      }),
    );
    expect(requestLines(fetchMock)).toEqual([
      `GET /v1/databases/${ids.db}`,
      `PATCH /v1/data_sources/${ids.ds}`,
      `GET /v1/databases/${ids.db}`,
    ]);
    // `Tags: null` removes the column: this is why the tool is destructive.
    expect(requestOf(fetchMock, 1).body).toEqual({
      properties,
      title: [{ text: { content: 'Tasks v2' } }],
    });
    expect(db).toMatchObject({ id: ids.db, title: 'Tasks v2' });
    // The re-read database carries no `properties`, so the returned schema is empty.
    expect(db.schema).toEqual({});
  });

  it('update-database-schema does not send `description`', async () => {
    const ids = dbIds(17);
    const fetchMock = mockFetch(jsonResponse(dataSourceBody(ids)), jsonResponse(databaseBody(ids)));
    ok(
      await callTool('update-database-schema', {
        databaseId: ids.db,
        dataSourceId: ids.ds,
        properties: {},
        description: 'All the tasks',
      }),
    );
    // What the code does today: the Notion SDK's data-source update has no `description`
    // body parameter, so the value the tool accepts is dropped without an error.
    expect(requestOf(fetchMock, 0).body).toEqual({ properties: {} });
  });
  it.todo('update-database-schema applies `description`, or rejects it');
  it.todo('update-database-schema returns the updated schema, as its description says');

  it('create-database-item serialises the flat map against the schema', async () => {
    const ids = dbIds(18);
    const fetchMock = mockFetch(
      jsonResponse(databaseBody(ids)),
      jsonResponse(dataSourceBody(ids)),
      jsonResponse(rowBody(PAGE, ids, 'Ship it')),
    );
    const row = ok(
      await callTool('create-database-item', {
        databaseId: ids.db,
        properties: { Name: 'Ship it', Status: 'Done', Tags: ['urgent'] },
      }),
    );
    expect(requestLines(fetchMock)).toEqual([
      `GET /v1/databases/${ids.db}`,
      `GET /v1/data_sources/${ids.ds}`,
      'POST /v1/pages',
    ]);
    expect(requestOf(fetchMock, 2).body).toEqual({
      parent: { data_source_id: ids.ds },
      properties: {
        Name: { title: [{ text: { content: 'Ship it' } }] },
        Status: { status: { name: 'Done' } },
        Tags: { multi_select: [{ name: 'urgent' }] },
      },
    });
    expect(row).toMatchObject({
      id: PAGE,
      title: 'Ship it',
      properties: { Name: 'Ship it', Status: 'Done', Tags: ['urgent'] },
    });
  });

  it('create-database-item rejects an unknown or read-only column without creating anything', async () => {
    const ids = dbIds(19);
    const fetchMock = mockFetch(jsonResponse(databaseBody(ids)), jsonResponse(dataSourceBody(ids)));
    const unknown = await callTool('create-database-item', {
      databaseId: ids.db,
      properties: { Nope: 'x' },
    });
    expect(unknown.success).toBe(false);
    expect(errorText(unknown)).toContain('property "Nope" (unknown)');
    expect(errorText(unknown)).toContain('Available columns: Name, Status, Tags, Created');
    const readOnly = await callTool('create-database-item', {
      databaseId: ids.db,
      properties: { Created: '2026-01-01' },
    });
    expect(errorText(readOnly)).toContain('read-only');
    // Only the two lookups of the first call; the schema is cached for the second.
    expect(requestLines(fetchMock)).toEqual([
      `GET /v1/databases/${ids.db}`,
      `GET /v1/data_sources/${ids.ds}`,
    ]);
  });

  it('create-database-item keeps using the old schema after update-database-schema adds a column', async () => {
    const ids = dbIds(23);
    const fetchMock = mockFetch(
      // create-database-item: database, data source (schema cached), create
      jsonResponse(databaseBody(ids)),
      jsonResponse(dataSourceBody(ids)),
      jsonResponse(rowBody(PAGE, ids, 'One')),
      // update-database-schema: update, re-read
      jsonResponse(dataSourceBody(ids)),
      jsonResponse(databaseBody(ids)),
      // second create-database-item: the database again (its data-source cache was cleared)
      jsonResponse(databaseBody(ids)),
    );
    ok(await callTool('create-database-item', { databaseId: ids.db, properties: { Name: 'One' } }));
    ok(
      await callTool('update-database-schema', {
        databaseId: ids.db,
        properties: { Priority: { select: { options: [{ name: 'High' }] } } },
      }),
    );
    const result = await callTool('create-database-item', {
      databaseId: ids.db,
      properties: { Name: 'Two', Priority: 'High' },
    });
    // What the code does today: update-database-schema clears the data-source cache but not
    // the schema cache, so the new column is unknown for up to five minutes.
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('property "Priority" (unknown)');
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(requestLines(fetchMock).slice(5)).toEqual([`GET /v1/databases/${ids.db}`]);
  });
  it.todo('create-database-item sees a column right after update-database-schema added it');

  it('create-database-item rejects properties that are not an object map', async () => {
    const ids = dbIds(20);
    const fetchMock = mockFetch();
    const result = await callTool('create-database-item', { databaseId: ids.db, properties: [] });
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('update-database-item reads the row’s database, then patches the serialised values', async () => {
    const ids = dbIds(21);
    const fetchMock = mockFetch(
      jsonResponse(rowBody(PAGE, ids, 'Ship it')),
      jsonResponse(databaseBody(ids)),
      jsonResponse(dataSourceBody(ids)),
      jsonResponse(rowBody(PAGE, ids, 'Ship it')),
    );
    const row = ok(
      await callTool('update-database-item', {
        pageId: PAGE,
        properties: { Status: 'Done' },
        archived: false,
      }),
    );
    expect(requestLines(fetchMock)).toEqual([
      `GET /v1/pages/${PAGE}`,
      `GET /v1/databases/${ids.db}`,
      `GET /v1/data_sources/${ids.ds}`,
      `PATCH /v1/pages/${PAGE}`,
    ]);
    expect(requestOf(fetchMock, 3).body).toEqual({
      properties: { Status: { status: { name: 'Done' } } },
      in_trash: false,
    });
    expect(row).toMatchObject({ id: PAGE, properties: { Status: 'Done' } });
  });

  it('update-database-item with only `archived` moves the row to the trash in one request', async () => {
    const ids = dbIds(22);
    const fetchMock = mockFetch(jsonResponse({ ...rowBody(PAGE, ids, 'Ship it'), in_trash: true }));
    const row = ok(await callTool('update-database-item', { pageId: PAGE, archived: true }));
    expect(requestLines(fetchMock)).toEqual([`PATCH /v1/pages/${PAGE}`]);
    expect(requestOf(fetchMock).body).toEqual({ in_trash: true });
    expect(row.inTrash).toBe(true);
  });

  it('update-database-item refuses a page that is not a database row', async () => {
    const fetchMock = mockFetch(jsonResponse(pageBody(PAGE, 'Roadmap')));
    const result = await callTool('update-database-item', {
      pageId: PAGE,
      properties: { Status: 'Done' },
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('requires the page to live under a database');
    expect(requestLines(fetchMock)).toEqual([`GET /v1/pages/${PAGE}`]);
  });
});

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

describe('blocks', () => {
  it('get-block reads one block', async () => {
    const fetchMock = mockFetch(jsonResponse(blockBody(BLOCK, 'Hello')));
    const block = ok(await callTool('get-block', { blockId: BLOCK }));
    const { url, method } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`GET ${API}/blocks/${BLOCK}`);
    expect(block).toMatchObject({
      id: BLOCK,
      type: 'paragraph',
      plainText: 'Hello',
      hasChildren: false,
      parentType: 'page',
      parentId: PAGE,
    });
  });

  it('get-blocks lists children with a clamped page size and a cursor', async () => {
    const fetchMock = mockFetch(
      jsonResponse(list([blockBody(BLOCK, 'Hello')], { has_more: true, next_cursor: 'c2' })),
    );
    const out = ok(await callTool('get-blocks', { blockId: PAGE, limit: 0, cursor: 'c1' }));
    const { url, method } = requestOf(fetchMock);
    expect(method).toBe('GET');
    expect(url.pathname).toBe(`/v1/blocks/${PAGE}/children`);
    expect(url.searchParams.get('page_size')).toBe('1');
    expect(url.searchParams.get('start_cursor')).toBe('c1');
    expect(out).toMatchObject({ total: 1, hasMore: true, nextCursor: 'c2' });
    expect(out.blocks[0]).toMatchObject({ id: BLOCK, plainText: 'Hello' });
  });

  it('get-block-children walks the tree and returns markdown-like text', async () => {
    const fetchMock = mockFetch(
      jsonResponse(
        list([
          blockBody(BLOCK, 'Title', {
            type: 'heading_1',
            heading_1: { rich_text: richText('Title') },
            has_children: true,
          }),
        ]),
      ),
      jsonResponse(
        list([
          blockBody(BLOCK_2, 'Buy milk', {
            type: 'to_do',
            to_do: { rich_text: richText('Buy milk'), checked: true },
          }),
        ]),
      ),
    );
    const out = ok(await callTool('get-block-children', { blockId: PAGE, includeBlockIds: true }));
    expect(requestLines(fetchMock)).toEqual([
      `GET /v1/blocks/${PAGE}/children?page_size=100`,
      `GET /v1/blocks/${BLOCK}/children?page_size=100`,
    ]);
    expect(out).toEqual({ textContent: `<!-- block: ${BLOCK} -->\n# Title\n  [x] Buy milk\n` });
  });

  it('append-blocks patches the children and the position', async () => {
    const fetchMock = mockFetch(jsonResponse(list([blockBody(BLOCK_2, 'New')])));
    const blocks = [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ text: { content: 'New' } }] },
      },
    ];
    const position = { type: 'after_block', after_block: { id: BLOCK } };
    const out = ok(await callTool('append-blocks', { blockId: PAGE, blocks, position }));
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`PATCH ${API}/blocks/${PAGE}/children`);
    expect(body).toEqual({ children: blocks, position });
    expect(out).toMatchObject({ parentId: PAGE, appendedCount: 1 });
    expect(out.blocks[0]).toMatchObject({ id: BLOCK_2, type: 'paragraph' });
  });

  it('update-block reads the block, replaces the text and patches it without null fields', async () => {
    const fetchMock = mockFetch(
      jsonResponse(blockBody(BLOCK, 'Hello world')),
      jsonResponse(blockBody(BLOCK, 'Hello there')),
    );
    const out = ok(
      await callTool('update-block', { blockId: BLOCK, oldText: 'world', newText: 'there' }),
    );
    expect(requestLines(fetchMock)).toEqual([
      `GET /v1/blocks/${BLOCK}`,
      `PATCH /v1/blocks/${BLOCK}`,
    ]);
    const { body } = requestOf(fetchMock, 1);
    expect(Object.keys(body)).toEqual(['paragraph']);
    expect(body.paragraph.icon).toBeUndefined();
    expect(body.paragraph.color).toBe('default');
    expect(body.paragraph.rich_text).toHaveLength(1);
    expect(body.paragraph.rich_text[0].text.content).toBe('Hello there');
    expect(body.paragraph.rich_text[0].plain_text).toBe('Hello there');
    expect(out).toMatchObject({
      oldText: 'world',
      newText: 'there',
      block: { id: BLOCK, plainText: 'Hello there' },
    });
  });

  it('update-block changes nothing when the text is not in the block', async () => {
    const fetchMock = mockFetch(jsonResponse(blockBody(BLOCK, 'Hello world')));
    const result = await callTool('update-block', {
      blockId: BLOCK,
      oldText: 'absent',
      newText: 'x',
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('Text not found in block. No changes made.');
    expect(requestLines(fetchMock)).toEqual([`GET /v1/blocks/${BLOCK}`]);
  });

  it('update-block refuses a block type without text', async () => {
    const fetchMock = mockFetch(
      jsonResponse(blockBody(BLOCK, '', { type: 'divider', divider: {} })),
    );
    const result = await callTool('update-block', { blockId: BLOCK, oldText: 'a', newText: 'b' });
    expect(errorText(result)).toContain("Block type 'divider' does not support text editing");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('delete-block sends DELETE and returns the trashed block', async () => {
    const fetchMock = mockFetch(jsonResponse(blockBody(BLOCK, 'Hello', { in_trash: true })));
    const out = ok(await callTool('delete-block', { blockId: BLOCK }));
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`DELETE ${API}/blocks/${BLOCK}`);
    expect(body).toBeUndefined();
    expect(out).toMatchObject({ deleted: true, block: { id: BLOCK, inTrash: true } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('delete-block reports a missing block and rejects a bad id before any request', async () => {
    const fetchMock = mockFetch(notionError(404, 'object_not_found', 'Could not find block.'));
    const bad = await callTool('delete-block', { blockId: 'nope' });
    expect(errorText(bad)).toContain('Invalid blockId');
    expect(fetchMock).not.toHaveBeenCalled();
    const missing = await callTool('delete-block', { blockId: BLOCK });
    expect(missing.success).toBe(false);
    expect(errorText(missing)).toContain('[NOT_FOUND]');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('create-column-layout appends one column_list with a column per inner array', async () => {
    const fetchMock = mockFetch(
      jsonResponse(
        list([blockBody(BLOCK, '', { type: 'column_list', column_list: {}, has_children: true })]),
      ),
    );
    const left = [{ object: 'block', type: 'divider', divider: {} }];
    const right = [{ object: 'block', type: 'divider', divider: {} }];
    const out = ok(
      await callTool('create-column-layout', { pageId: PAGE, columns: [left, right] }),
    );
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`PATCH ${API}/blocks/${PAGE}/children`);
    expect(body).toEqual({
      children: [
        {
          object: 'block',
          type: 'column_list',
          column_list: {
            children: [
              { object: 'block', type: 'column', column: { children: left } },
              { object: 'block', type: 'column', column: { children: right } },
            ],
          },
        },
      ],
    });
    expect(out).toMatchObject({ parentId: PAGE, columnsCreated: 2 });
    expect(out.blocks[0]).toMatchObject({ id: BLOCK, type: 'column_list' });
  });

  it('create-advanced-blocks appends one block of the given type', async () => {
    const content = {
      rich_text: [{ text: { content: 'Careful' } }],
      icon: { type: 'emoji', emoji: '⚠️' },
      color: 'yellow_background',
    };
    const fetchMock = mockFetch(
      jsonResponse(list([blockBody(BLOCK, '', { type: 'callout', callout: content })])),
    );
    const out = ok(
      await callTool('create-advanced-blocks', { pageId: PAGE, blockType: 'callout', content }),
    );
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`PATCH ${API}/blocks/${PAGE}/children`);
    expect(body).toEqual({ children: [{ object: 'block', type: 'callout', callout: content }] });
    expect(out).toMatchObject({ parentId: PAGE, blockType: 'callout', appendedCount: 1 });
  });
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

describe('users', () => {
  it('list-users lists the workspace users', async () => {
    const fetchMock = mockFetch(jsonResponse(list([personBody, botBody])));
    const out = ok(await callTool('list-users', { limit: 2, startCursor: 'c1' }));
    const { url, method } = requestOf(fetchMock);
    expect(method).toBe('GET');
    expect(url.pathname).toBe('/v1/users');
    expect(url.searchParams.get('page_size')).toBe('2');
    expect(url.searchParams.get('start_cursor')).toBe('c1');
    expect(out).toEqual({
      users: [
        {
          id: USER,
          name: 'Ada Example',
          type: 'person',
          avatarUrl: null,
          email: 'ada@example.com',
          bot: false,
        },
        { id: BOT, name: 'Test Integration', type: 'bot', avatarUrl: null, email: null, bot: true },
      ],
      total: 2,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('get-user reads one user and rejects a bad id', async () => {
    const fetchMock = mockFetch(jsonResponse(personBody));
    const bad = await callTool('get-user', { userId: 'me' });
    expect(errorText(bad)).toContain('Invalid userId');
    expect(fetchMock).not.toHaveBeenCalled();
    const user = ok(await callTool('get-user', { userId: USER, fields: ['id', 'email'] }));
    const { url, method } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`GET ${API}/users/${USER}`);
    expect(user).toEqual({ id: USER, email: 'ada@example.com' });
  });

  it('get-me reads the bot user, and includeRaw returns Notion’s object untouched', async () => {
    const fetchMock = mockFetch(jsonResponse(botBody));
    const me = ok(await callTool('get-me', { includeRaw: true }));
    const { url, method } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`GET ${API}/users/me`);
    expect(me).toMatchObject({ object: 'user', id: BOT, type: 'bot' });
  });
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

describe('comments', () => {
  it('list-comments lists the comments of a block or page', async () => {
    const fetchMock = mockFetch(jsonResponse(list([commentBody('Looks good')])));
    const out = ok(await callTool('list-comments', { blockId: PAGE }));
    const { url, method } = requestOf(fetchMock);
    expect(method).toBe('GET');
    expect(url.pathname).toBe('/v1/comments');
    expect(url.searchParams.get('block_id')).toBe(PAGE);
    expect(url.searchParams.get('page_size')).toBe('50');
    expect(out).toEqual({
      comments: [
        {
          id: COMMENT,
          pageId: PAGE,
          parentBlockId: null,
          discussionId: DISCUSSION,
          authorId: USER,
          plainText: 'Looks good',
          createdTime: '2026-01-02T03:04:00.000Z',
          lastEditedTime: '2026-01-03T03:04:00.000Z',
        },
      ],
      total: 1,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('create-comment posts a comment on a page', async () => {
    const fetchMock = mockFetch(jsonResponse(commentBody('Looks good')));
    const comment = ok(await callTool('create-comment', { pageId: PAGE, text: 'Looks good' }));
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`POST ${API}/comments`);
    expect(body).toEqual({
      parent: { page_id: PAGE },
      rich_text: [{ text: { content: 'Looks good' } }],
    });
    expect(comment).toMatchObject({ id: COMMENT, pageId: PAGE, plainText: 'Looks good' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('create-comment replies to a discussion', async () => {
    const fetchMock = mockFetch(jsonResponse(commentBody('Agreed')));
    ok(await callTool('create-comment', { discussionId: DISCUSSION, text: 'Agreed' }));
    expect(requestOf(fetchMock).body).toEqual({
      discussion_id: DISCUSSION,
      rich_text: [{ text: { content: 'Agreed' } }],
    });
  });

  it('create-comment needs a pageId or a discussionId', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('create-comment', { text: 'Hi' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('Either pageId or discussionId must be provided');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('update-comment patches the comment text', async () => {
    const fetchMock = mockFetch(jsonResponse(commentBody('Edited')));
    const comment = ok(await callTool('update-comment', { commentId: COMMENT, text: 'Edited' }));
    const { url, method, body } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`PATCH ${API}/comments/${COMMENT}`);
    expect(body).toEqual({ rich_text: [{ text: { content: 'Edited' } }] });
    expect(comment).toMatchObject({ id: COMMENT, plainText: 'Edited' });
  });

  it('update-comment needs exactly one of text and richText', async () => {
    const fetchMock = mockFetch();
    const neither = await callTool('update-comment', { commentId: COMMENT });
    expect(errorText(neither)).toContain('Either text or richText is required');
    const both = await callTool('update-comment', {
      commentId: COMMENT,
      text: 'a',
      richText: [{ text: { content: 'a' } }],
    });
    expect(errorText(both)).toContain('Pass only one of text / richText');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('delete-comment sends DELETE', async () => {
    const fetchMock = mockFetch(jsonResponse(commentBody('Looks good')));
    const out = ok(await callTool('delete-comment', { commentId: COMMENT }));
    const { url, method } = requestOf(fetchMock);
    expect(`${method} ${url}`).toBe(`DELETE ${API}/comments/${COMMENT}`);
    expect(out).toEqual({ id: COMMENT, deleted: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('delete-comment answers deleted for a comment Notion no longer finds, and fails on a 403', async () => {
    const fetchMock = mockFetch(
      notionError(404, 'object_not_found', 'Could not find comment.'),
      notionError(403, 'restricted_resource', 'Insufficient permissions.'),
    );
    expect(ok(await callTool('delete-comment', { commentId: COMMENT }))).toEqual({
      id: COMMENT,
      deleted: true,
    });
    const denied = await callTool('delete-comment', { commentId: COMMENT });
    expect(denied.success).toBe(false);
    expect(errorText(denied)).toContain('[PERMISSION_DENIED]');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// File uploads
// ---------------------------------------------------------------------------

describe('upload-file', () => {
  const dataUrl = `data:text/plain;base64,${Buffer.from('hello').toString('base64')}`;
  const uploadBody = (status: string) => ({
    object: 'file_upload',
    id: UPLOAD,
    status,
    filename: 'hello.txt',
    content_type: 'text/plain',
    content_length: status === 'pending' ? null : 5,
  });

  it('creates the upload, sends the bytes as multipart and skips complete when uploaded', async () => {
    const fetchMock = mockFetch(
      jsonResponse(uploadBody('pending')),
      jsonResponse(uploadBody('uploaded')),
    );
    const out = ok(
      await callTool('upload-file', {
        pageId: PAGE,
        name: 'hello.txt',
        contentType: 'text/plain',
        dataUrl,
      }),
    );
    expect(requestLines(fetchMock)).toEqual([
      'POST /v1/file_uploads',
      `POST /v1/file_uploads/${UPLOAD}/send`,
    ]);
    // What the code does today: the handler passes `parent` and `name`, which are not body
    // parameters of the SDK's create call, so only the content type is sent.
    expect(requestOf(fetchMock, 0).body).toEqual({ content_type: 'text/plain' });

    const form = requestOf(fetchMock, 1).rawBody as FormData;
    expect(form).toBeInstanceOf(FormData);
    const file = form.get('file') as File;
    expect(file.name).toBe('hello.txt');
    expect(file.type).toBe('text/plain');
    expect(await file.text()).toBe('hello');

    expect(out).toEqual({
      fileUploadId: UPLOAD,
      status: 'uploaded',
      name: 'hello.txt',
      contentType: 'text/plain',
      sizeBytes: 5,
    });
  });

  // Bug: `name` is documented as the filename and `pageId` as "the page owning the upload",
  // but neither reaches Notion when the upload is created (src/tools/upload-file.ts).
  it.todo('sends the filename when it creates the upload');
  it.todo('uses `pageId` for something, or stops requiring it');

  it('completes an upload that is still pending after the bytes are sent', async () => {
    const fetchMock = mockFetch(
      jsonResponse(uploadBody('pending')),
      jsonResponse(uploadBody('pending')),
      jsonResponse(uploadBody('uploaded')),
    );
    const out = ok(
      await callTool('upload-file', {
        pageId: PAGE,
        name: 'hello.txt',
        contentType: 'text/plain',
        dataUrl,
      }),
    );
    expect(requestLines(fetchMock)).toEqual([
      'POST /v1/file_uploads',
      `POST /v1/file_uploads/${UPLOAD}/send`,
      `POST /v1/file_uploads/${UPLOAD}/complete`,
    ]);
    expect(out.status).toBe('uploaded');
  });

  it('rejects bad input before any request', async () => {
    const fetchMock = mockFetch();
    const base = { pageId: PAGE, name: 'hello.txt', contentType: 'text/plain' };
    const none = await callTool('upload-file', base);
    expect(errorText(none)).toContain('Either dataUrl or filePath is required');
    const both = await callTool('upload-file', { ...base, dataUrl, filePath: '/nonexistent/x' });
    expect(errorText(both)).toContain('Pass only one of dataUrl / filePath');
    const raw = await callTool('upload-file', { ...base, dataUrl: 'aGVsbG8=' });
    expect(errorText(raw)).toContain('dataUrl must be of shape');
    const badPage = await callTool('upload-file', { ...base, pageId: 'x', dataUrl });
    expect(errorText(badPage)).toContain('Invalid pageId');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports Notion’s error when the upload cannot be created', async () => {
    const fetchMock = mockFetch(notionError(400, 'validation_error', 'Unsupported content type.'));
    const result = await callTool('upload-file', {
      pageId: PAGE,
      name: 'hello.txt',
      contentType: 'text/plain',
      dataUrl,
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[VALIDATION_ERROR]');
    expect(errorText(result)).toContain('Unsupported content type.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Arguments the SDK checks before the handler runs
// ---------------------------------------------------------------------------

describe('arguments', () => {
  it('fails on an unknown tool without any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('delete-page', { pageId: PAGE });
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails on a missing required argument without any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('delete-block', {});
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
