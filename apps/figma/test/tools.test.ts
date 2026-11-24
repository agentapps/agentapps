/**
 * Tool, client and health tests for the Figma Agent App.
 *
 * The network is mocked: every test queues the responses it expects and asserts the
 * request the app sent. Bodies follow the shapes of the Figma REST API (`/v1/files/...`,
 * `/v1/images/...`) with synthetic values.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  callTool,
  installationSecrets,
  jsonResponse,
  mockFetch,
  requestOf,
  runHealthCheck,
  systemSecrets,
} from './harness.js';

const KEY = 'abcDEF123xyz';
const API = 'https://api.figma.com/v1';

const TEXT_NODE = {
  id: '1:3',
  name: 'Title',
  type: 'TEXT',
  fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
  style: {
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 24,
    lineHeightPx: 32,
    letterSpacing: -0.5,
  },
  absoluteBoundingBox: { x: 10, y: 10, width: 200.4, height: 32 },
};
const FRAME_NODE = {
  id: '1:2',
  name: 'Card',
  type: 'FRAME',
  fills: [
    { type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } },
    { type: 'IMAGE', imageRef: 'img_1' },
  ],
  strokes: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 0.5 } }],
  strokeWeight: 2,
  cornerRadius: 8,
  absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 180.6 },
  children: [TEXT_NODE],
};
const FILE = {
  name: 'Design system',
  lastModified: '2026-03-01T10:00:00Z',
  thumbnailUrl: 'https://s3-alpha.figma.com/thumbnails/synthetic',
  version: '2218899021',
  role: 'viewer',
  editorType: 'figma',
  document: {
    id: '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: [{ id: '0:1', name: 'Page 1', type: 'CANVAS', children: [FRAME_NODE] }],
  },
  components: {
    '4:1': { key: 'cmp_key_1', name: 'Button', description: '', componentSetId: '5:1' },
    '4:2': { key: 'cmp_key_2', name: 'Icon', description: 'An icon' },
  },
  componentSets: { '5:1': { key: 'set_key_1', name: 'Button', description: 'Variants' } },
  styles: {
    '6:1': { key: 'sty_key_1', name: 'Brand/Red', styleType: 'FILL', description: '' },
  },
};

const RAW_COMMENT = {
  id: '1234567',
  file_key: KEY,
  parent_id: '',
  user: { handle: 'Ada Example', img_url: 'https://example.com/a.png', id: '99' },
  created_at: '2026-03-01T10:00:00.000Z',
  resolved_at: null,
  message: 'Looks good',
  client_meta: { node_id: '1:2', node_offset: { x: 5, y: 6 } },
  order_id: '12',
};

type Result = Record<string, unknown>;
const errorOf = (res: Record<string, unknown>) =>
  (res.error as { message: string } | undefined)?.message ?? '';
const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

describe('create-comment', () => {
  it('posts the comment and returns the curated comment', async () => {
    const fetchMock = mockFetch(jsonResponse(RAW_COMMENT));
    const res = await callTool('create-comment', {
      fileKey: KEY,
      message: '  Looks good  ',
      clientMeta: { node_id: '1:2' },
    });

    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = requestOf(fetchMock);
    expect(url.href).toBe(`${API}/files/${KEY}/comments`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      message: 'Looks good',
      client_meta: { node_id: '1:2' },
    });
    expect(headersOf(init)).toEqual({
      Authorization: 'Bearer fake-access-token',
      'Content-Type': 'application/json',
    });
    expect(res.result).toMatchObject({
      id: '1234567',
      message: 'Looks good',
      createdAt: '2026-03-01T10:00:00.000Z',
      user: 'Ada Example',
      resolved: false,
      clientMeta: { node_id: '1:2', node_offset: { x: 5, y: 6 } },
    });
    expect((res.result as Result).parentId).toBeUndefined();
  });

  it('sends a reply with comment_id', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ ...RAW_COMMENT, id: '1234568', parent_id: '1234567' }),
    );
    const res = await callTool('create-comment', {
      fileKey: KEY,
      message: 'Agreed',
      parentCommentId: '1234567',
    });

    expect(JSON.parse(requestOf(fetchMock).init.body as string)).toEqual({
      message: 'Agreed',
      comment_id: '1234567',
    });
    expect(res.result).toMatchObject({ id: '1234568', parentId: '1234567' });
  });

  it('returns the raw payload with includeRaw', async () => {
    mockFetch(jsonResponse(RAW_COMMENT));
    const res = await callTool('create-comment', { fileKey: KEY, message: 'x', includeRaw: true });
    expect(res.result).toEqual(RAW_COMMENT);
  });

  it('rejects an empty message and a bad file key before any request', async () => {
    const fetchMock = mockFetch();
    const empty = await callTool('create-comment', { fileKey: KEY, message: '   ' });
    expect(empty.success).toBe(false);
    expect(errorOf(empty)).toContain('message must be a non-empty string');

    const badKey = await callTool('create-comment', { fileKey: '../me', message: 'x' });
    expect(badKey.success).toBe(false);
    expect(errorOf(badKey)).toContain('fileKey contains invalid characters');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry a failed POST', async () => {
    const fetchMock = mockFetch(jsonResponse({ status: 500, err: 'Internal error' }, 500));
    const res = await callTool('create-comment', { fileKey: KEY, message: 'x' });
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('[DEPENDENCY_UNAVAILABLE] Internal error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('delete-comment', () => {
  it('sends DELETE for the comment and confirms', async () => {
    const fetchMock = mockFetch(jsonResponse({ status: 200, error: false }));
    const res = await callTool('delete-comment', { fileKey: KEY, commentId: ' 1234567 ' });

    expect(res.success).toBe(true);
    expect(res.result).toEqual({ ok: true, fileKey: KEY, commentId: '1234567' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = requestOf(fetchMock);
    expect(url.href).toBe(`${API}/files/${KEY}/comments/1234567`);
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(headersOf(init).Authorization).toBe('Bearer fake-access-token');
  });

  it('escapes the comment id in the path', async () => {
    const fetchMock = mockFetch(jsonResponse({ status: 200, error: false }));
    await callTool('delete-comment', { fileKey: KEY, commentId: '12/../34?x=1' });
    expect(requestOf(fetchMock).url.pathname).toBe(
      `/v1/files/${KEY}/comments/12%2F..%2F34%3Fx%3D1`,
    );
  });

  it('rejects an empty comment id and a bad file key before any request', async () => {
    const fetchMock = mockFetch();
    const empty = await callTool('delete-comment', { fileKey: KEY, commentId: ' ' });
    expect(errorOf(empty)).toContain('commentId must be a non-empty string');
    const badKey = await callTool('delete-comment', { fileKey: 'a/b', commentId: '1' });
    expect(errorOf(badKey)).toContain('fileKey contains invalid characters');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a 404 as NOT_FOUND and a 403 as PERMISSION_DENIED, without retrying', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ status: 404, err: 'Not found' }, 404),
      jsonResponse({ status: 403, err: 'Forbidden' }, 403),
    );
    const missing = await callTool('delete-comment', { fileKey: KEY, commentId: '1' });
    expect(missing.success).toBe(false);
    expect(errorOf(missing)).toContain('[NOT_FOUND] Not found');
    const denied = await callTool('delete-comment', { fileKey: KEY, commentId: '1' });
    expect(errorOf(denied)).toContain('[PERMISSION_DENIED] Forbidden');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('files and nodes', () => {
  it('get-file requests the file at depth 2 and returns the curated tree', async () => {
    const fetchMock = mockFetch(jsonResponse(FILE));
    const res = await callTool('get-file', { fileKey: KEY });

    expect(res.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(url.href).toBe(`${API}/files/${KEY}?depth=2`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    const result = res.result as Result;
    expect(result).toMatchObject({
      name: 'Design system',
      lastModified: '2026-03-01T10:00:00Z',
      version: '2218899021',
      thumbnailUrl: 'https://s3-alpha.figma.com/thumbnails/synthetic',
      componentCount: 2,
      styleCount: 1,
      role: 'viewer',
      editorType: 'figma',
    });
    // Depth 2: document > page > frame; the frame's children are only counted.
    expect(result.document).toEqual({
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: [
        {
          id: '0:1',
          name: 'Page 1',
          type: 'CANVAS',
          children: [
            {
              id: '1:2',
              name: 'Card',
              type: 'FRAME',
              bounds: { width: 320, height: 181 },
              fills: [{ type: 'SOLID', color: '#ffffff' }],
              strokes: [{ type: 'SOLID', color: 'rgba(255, 0, 0, 0.50)' }],
              strokeWeight: 2,
              cornerRadius: 8,
              childCount: 1,
            },
          ],
        },
      ],
    });
  });

  it('get-file caps depth at 10 and passes geometry and branch_data', async () => {
    const fetchMock = mockFetch(jsonResponse(FILE));
    await callTool('get-file', { fileKey: KEY, depth: 99, geometry: 'paths', branchData: true });
    expect(Object.fromEntries(requestOf(fetchMock).url.searchParams)).toEqual({
      depth: '10',
      geometry: 'paths',
      branch_data: 'true',
    });
  });

  it('get-node accepts the URL form of a node id and returns the curated node', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ name: FILE.name, nodes: { '1:2': { document: FRAME_NODE } } }),
    );
    const res = await callTool('get-node', { fileKey: KEY, nodeId: '1-2' });

    expect(requestOf(fetchMock).url.href).toBe(`${API}/files/${KEY}/nodes?ids=1%3A2&depth=3`);
    expect(res.result).toMatchObject({
      id: '1:2',
      name: 'Card',
      type: 'FRAME',
      children: [
        {
          id: '1:3',
          name: 'Title',
          type: 'TEXT',
          bounds: { width: 200, height: 32 },
          fills: [{ type: 'SOLID', color: '#000000' }],
          textStyle: {
            fontFamily: 'Inter',
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 32,
            letterSpacing: -0.5,
          },
        },
      ],
    });
  });

  it('get-node fails when Figma returns null for the node', async () => {
    mockFetch(jsonResponse({ nodes: { '9:9': null } }));
    const res = await callTool('get-node', { fileKey: KEY, nodeId: '9:9' });
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain(`Node 9:9 not found in file ${KEY}`);
  });
});

describe('styles, variables and components', () => {
  it('get-file-styles lists the styles of the file', async () => {
    const fetchMock = mockFetch(jsonResponse(FILE));
    const res = await callTool('get-file-styles', { fileKey: KEY });
    expect(requestOf(fetchMock).url.href).toBe(`${API}/files/${KEY}`);
    expect(res.result).toEqual({
      styles: [{ id: '6:1', key: 'sty_key_1', name: 'Brand/Red', type: 'FILL', description: '' }],
      count: 1,
    });
  });

  it('get-components and get-component-sets list from the same file request', async () => {
    const fetchMock = mockFetch(jsonResponse(FILE), jsonResponse(FILE));
    const components = await callTool('get-components', { fileKey: KEY, fields: ['id', 'name'] });
    expect(components.result).toEqual({
      components: [
        { id: '4:1', name: 'Button' },
        { id: '4:2', name: 'Icon' },
      ],
      count: 2,
    });
    const sets = await callTool('get-component-sets', { fileKey: KEY });
    expect(sets.result).toEqual({
      componentSets: [{ id: '5:1', key: 'set_key_1', name: 'Button', description: 'Variants' }],
      count: 1,
    });
    expect(requestOf(fetchMock, 0).url.href).toBe(`${API}/files/${KEY}`);
    expect(requestOf(fetchMock, 1).url.href).toBe(`${API}/files/${KEY}`);
  });

  it('get-file-variables groups the variables by collection', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        status: 200,
        error: false,
        meta: {
          variables: {
            'VariableID:1:1': {
              id: 'VariableID:1:1',
              name: 'color/brand',
              resolvedType: 'COLOR',
              valuesByMode: { '1:0': { r: 1, g: 0, b: 0, a: 1 } },
              description: 'Brand red',
            },
          },
          variableCollections: {
            'VariableCollectionId:1:0': {
              id: 'VariableCollectionId:1:0',
              name: 'Tokens',
              modes: [{ modeId: '1:0', name: 'Light' }],
              defaultModeId: '1:0',
              variableIds: ['VariableID:1:1', 'VariableID:9:9'],
            },
          },
        },
      }),
    );
    const res = await callTool('get-file-variables', { fileKey: KEY });

    expect(requestOf(fetchMock).url.href).toBe(`${API}/files/${KEY}/variables/local`);
    expect(res.result).toEqual({
      collections: [
        {
          id: 'VariableCollectionId:1:0',
          name: 'Tokens',
          modes: [{ modeId: '1:0', name: 'Light' }],
          defaultModeId: '1:0',
          variables: [
            {
              id: 'VariableID:1:1',
              name: 'color/brand',
              type: 'COLOR',
              values: { '1:0': { r: 1, g: 0, b: 0, a: 1 } },
              description: 'Brand red',
            },
          ],
        },
      ],
      collectionCount: 1,
      variableCount: 1,
    });
  });
});

describe('export-images', () => {
  it('requests the image URLs and drops the nodes Figma could not render', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        err: null,
        images: { '1:2': 'https://figma-alpha-api.s3/img/1', '3:4': null },
      }),
    );
    const res = await callTool('export-images', {
      fileKey: KEY,
      nodeIds: ['1-2', '3:4'],
      format: 'svg',
      scale: 9,
    });

    const { url, init } = requestOf(fetchMock);
    expect(url.origin + url.pathname).toBe(`${API}/images/${KEY}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ids: '1:2,3:4',
      format: 'svg',
      scale: '4',
    });
    expect(init.method).toBe('GET');
    expect(res.result).toEqual({
      images: [{ nodeId: '1:2', url: 'https://figma-alpha-api.s3/img/1', format: 'svg', scale: 4 }],
      count: 1,
      expiresInMinutes: 30,
    });
  });

  it('defaults to png at scale 1', async () => {
    const fetchMock = mockFetch(jsonResponse({ err: null, images: {} }));
    await callTool('export-images', { fileKey: KEY, nodeIds: ['1:2'] });
    expect(Object.fromEntries(requestOf(fetchMock).url.searchParams)).toEqual({
      ids: '1:2',
      format: 'png',
      scale: '1',
    });
  });

  it('rejects an empty list of nodes before any request', async () => {
    const fetchMock = mockFetch();
    const res = await callTool('export-images', { fileKey: KEY, nodeIds: [] });
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('nodeIds must be a non-empty array');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('comments and versions', () => {
  it('get-comments lists the comments of the file', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        comments: [
          RAW_COMMENT,
          {
            ...RAW_COMMENT,
            id: '1234568',
            parent_id: '1234567',
            user: null,
            resolved_at: '2026-03-02T09:00:00.000Z',
            client_meta: null,
          },
        ],
      }),
    );
    const res = await callTool('get-comments', { fileKey: KEY });

    const { url, init } = requestOf(fetchMock);
    expect(url.href).toBe(`${API}/files/${KEY}/comments`);
    expect(init.method).toBe('GET');
    const result = res.result as { comments: Result[]; count: number };
    expect(result.count).toBe(2);
    expect(result.comments[0]).toMatchObject({
      id: '1234567',
      message: 'Looks good',
      user: 'Ada Example',
      resolved: false,
    });
    expect(result.comments[1]).toMatchObject({
      id: '1234568',
      user: 'Unknown',
      resolved: true,
      parentId: '1234567',
      clientMeta: null,
    });
  });

  it('list-file-versions pages with page_size and before', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        versions: [
          {
            id: '2218899021',
            created_at: '2026-03-01T10:00:00Z',
            label: null,
            description: null,
            user: { handle: 'Ada Example', img_url: 'https://example.com/a.png', id: '99' },
            thumbnail_url: 'https://s3-alpha.figma.com/thumbnails/v1',
          },
        ],
        pagination: { next_page: `${API}/files/${KEY}/versions?page_size=50&before=2218899021` },
      }),
    );
    const res = await callTool('list-file-versions', {
      fileKey: KEY,
      pageSize: 500,
      before: '2218899999',
    });

    const { url } = requestOf(fetchMock);
    expect(url.origin + url.pathname).toBe(`${API}/files/${KEY}/versions`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page_size: '50',
      before: '2218899999',
    });
    expect(res.result).toEqual({
      versions: [
        {
          id: '2218899021',
          createdAt: '2026-03-01T10:00:00Z',
          label: '',
          description: '',
          user: 'Ada Example',
          thumbnailUrl: 'https://s3-alpha.figma.com/thumbnails/v1',
        },
      ],
      count: 1,
      nextPage: `${API}/files/${KEY}/versions?page_size=50&before=2218899021`,
    });
  });
});

describe('extract', () => {
  it('extract-colors reads the whole file and writes CSS variables', async () => {
    const fetchMock = mockFetch(jsonResponse(FILE));
    const res = await callTool('extract-colors', { fileKey: KEY });

    expect(requestOf(fetchMock).url.href).toBe(`${API}/files/${KEY}?depth=100`);
    expect(res.result).toEqual({
      count: 3,
      output:
        ':root {\n  --color-1: #ffffff;\n  --color-2: rgba(255, 0, 0, 0.50);\n  --color-3: #000000;\n}',
      format: 'css',
    });
  });

  it('extract-colors scoped to a node asks for that node, as JSON', async () => {
    const fetchMock = mockFetch(jsonResponse({ nodes: { '1:3': { document: TEXT_NODE } } }));
    const res = await callTool('extract-colors', { fileKey: KEY, nodeId: '1-3', format: 'json' });

    expect(requestOf(fetchMock).url.href).toBe(`${API}/files/${KEY}/nodes?ids=1%3A3&depth=100`);
    expect(res.result).toEqual({ count: 1, output: '[\n  "#000000"\n]', format: 'json' });
  });

  it('extract-typography writes one Tailwind entry per text style', async () => {
    const fetchMock = mockFetch(jsonResponse(FILE));
    const res = await callTool('extract-typography', { fileKey: KEY, format: 'tailwind' });

    expect(requestOf(fetchMock).url.href).toBe(`${API}/files/${KEY}?depth=100`);
    expect(res.result).toEqual({
      count: 1,
      output:
        '// tailwind.config.js fontSize\n{\n  "text-1": ["24px", { lineHeight: "32px", fontWeight: "700" }]\n}',
      format: 'tailwind',
    });
  });
});

describe('client', () => {
  it('refreshes the token once on a 401 and replays the request with the new one', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ status: 401, err: 'Token expired' }, 401),
      jsonResponse({ access_token: 'fake-new-access-token', expires_in: 7776000 }),
      jsonResponse({ comments: [] }),
    );
    const res = await callTool('get-comments', { fileKey: KEY });

    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refresh = requestOf(fetchMock, 1);
    expect(refresh.url.href).toBe('https://api.figma.com/v1/oauth/token');
    expect(refresh.init.method).toBe('POST');
    expect(headersOf(refresh.init)).toEqual({
      Authorization: `Basic ${Buffer.from('fake-client-id:fake-client-secret').toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(Object.fromEntries(refresh.init.body as URLSearchParams)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'fake-refresh-token',
    });
    expect(headersOf(requestOf(fetchMock, 0).init).Authorization).toBe('Bearer fake-access-token');
    expect(headersOf(requestOf(fetchMock, 2).init).Authorization).toBe(
      'Bearer fake-new-access-token',
    );
  });

  it('stops with AUTH_EXPIRED when the replayed request is rejected too', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ status: 401, err: 'Token expired' }, 401),
      jsonResponse({ access_token: 'fake-new-access-token' }),
      jsonResponse({ status: 401, err: 'Token expired' }, 401),
    );
    const res = await callTool('get-comments', { fileKey: KEY });
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('[AUTH_EXPIRED] Token expired');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('asks to reconnect when there is no refresh token', async () => {
    const fetchMock = mockFetch(jsonResponse({ status: 401, err: 'Token expired' }, 401));
    delete installationSecrets.REFRESH_TOKEN;
    const res = await callTool('get-comments', { fileKey: KEY });
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('[AUTH_REQUIRED] No refresh token available');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a GET that hit the rate limit, honouring Retry-After', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ status: 429, err: 'Rate limit exceeded' }, 429, { 'Retry-After': '0' }),
      jsonResponse({ comments: [] }),
    );
    const res = await callTool('get-comments', { fileKey: KEY });
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 404, and names no secret in the error', async () => {
    const fetchMock = mockFetch(jsonResponse({ status: 404, err: 'Not found' }, 404));
    const res = await callTool('get-file', { fileKey: KEY });
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('[NOT_FOUND] Not found');
    expect(errorOf(res)).not.toContain('fake-access-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails without an access token before any request', async () => {
    const fetchMock = mockFetch();
    delete installationSecrets.ACCESS_TOKEN;
    const res = await callTool('get-file', { fileKey: KEY });
    expect(res.success).toBe(false);
    expect(errorOf(res)).toBe(
      '[AUTH_REQUIRED] Figma account not connected. Please connect your Figma account.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('names the missing OAuth client when a refresh is needed without one', async () => {
    const fetchMock = mockFetch(jsonResponse({ status: 401, err: 'Token expired' }, 401));
    delete systemSecrets.CLIENT_ID;
    const res = await callTool('get-comments', { fileKey: KEY });
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain(
      '[SYSTEM_CONFIG_MISSING] Figma OAuth CLIENT_ID and CLIENT_SECRET',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Oddity: the refreshed token is used for the replay only. The app never stores it
  // (no ctx.secrets.updateInstallation, no ctx.auth.refresh in src/lib/figma-client.ts), so
  // every later call starts with the expired token again and pays a 401 plus a refresh.
  it.todo('stores the refreshed access token so the next call does not refresh again');
});

describe('health check', () => {
  it('is ready when /me answers with the stored token', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: '99', handle: 'Ada Example' }));
    const health = await runHealthCheck();

    expect(health.status).toBe('ready');
    expect(health.message).toBe('Figma connected');
    const { url, init } = requestOf(fetchMock);
    expect(url.href).toBe(`${API}/me`);
    expect(init.method).toBeUndefined();
    expect(init.headers).toEqual({ Authorization: 'Bearer fake-access-token' });
  });

  it('is not_ready with SYSTEM_NOT_CONFIGURED without the OAuth client', async () => {
    const fetchMock = mockFetch();
    delete systemSecrets.CLIENT_SECRET;
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect((health.issues as Array<{ code: string }>)[0].code).toBe('SYSTEM_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is not_ready with USER_NOT_AUTHENTICATED without an access token', async () => {
    const fetchMock = mockFetch();
    delete installationSecrets.ACCESS_TOKEN;
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(health.message).toBe('Figma account not connected');
    expect((health.issues as Array<{ code: string }>)[0].code).toBe('USER_NOT_AUTHENTICATED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is not_ready with AUTH_EXPIRED when Figma rejects the token', async () => {
    mockFetch(jsonResponse({ status: 403, err: 'Invalid token' }, 403));
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect((health.issues as Array<{ code: string }>)[0].code).toBe('AUTH_EXPIRED');
  });

  it('is degraded when Figma answers a server error', async () => {
    mockFetch(jsonResponse({ status: 503, err: 'Unavailable' }, 503));
    const health = await runHealthCheck();
    expect(health.status).toBe('degraded');
    expect(health.message).toBe('Figma API error: 503');
    expect((health.issues as Array<{ code: string }>)[0].code).toBe('DEPENDENCY_UNAVAILABLE');
  });

  it('is degraded when Figma is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const health = await runHealthCheck();
    expect(health.status).toBe('degraded');
    expect(health.message).toBe('Failed to reach Figma: fetch failed');
  });
});
