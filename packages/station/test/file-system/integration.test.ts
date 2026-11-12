/**
 * E2E integration tests — full file system flow with real HTTP server.
 *
 * Spins up a StationServer on a random port, exercises the Volume and
 * Objects end-to-end:
 *
 * 1. Write + read files via volume requests
 * 2. Put objects, fetch them over HTTP (public, and private through a link)
 * 3. Expired links and deleted objects stop working
 * 4. Cross-workspace isolation
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleObjectRequest, ObjectStore } from '../../src/file-handlers/object-store.js';
import {
  handleVolumeRequest,
  type VolumeHandlerContext,
} from '../../src/file-handlers/volume-handlers.js';
import { StationServer } from '../../src/server.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tempBase: string;
let server: StationServer;
let baseUrl: string;
let objectStore: ObjectStore;

const TEST_SECRET = 'integration-test-station-secret';

beforeAll(async () => {
  tempBase = await mkdtemp(join(tmpdir(), 'agentapps-e2e-int-'));

  // Set env vars so the server picks up our test config
  process.env.AGENTAPPS_VOLUMES_BASE_PATH = tempBase;
  process.env.AGENTAPPS_STATION_SECRET = TEST_SECRET;

  server = new StationServer();
  const info = await server.start(0, '127.0.0.1');
  baseUrl = info.url;
  objectStore = new ObjectStore({
    volumesBasePath: tempBase,
    stationSecret: TEST_SECRET,
    publicUrl: baseUrl,
  });
});

afterAll(async () => {
  await server?.stop();
  await rm(tempBase, { recursive: true, force: true });
  delete process.env.AGENTAPPS_VOLUMES_BASE_PATH;
  delete process.env.AGENTAPPS_STATION_SECRET;
});

function makeVolCtx(workspaceId: string): VolumeHandlerContext {
  return {
    volumesBasePath: tempBase,
    workspaceId,
    sessionId: 'sess_int',
    permissions: { volume: true },
  };
}

function makeVolMsg(
  type: string,
  path: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'msg_int',
    type,
    timestamp: new Date().toISOString(),
    version: '2.0',
    sessionId: 'sess_int',
    requestId: 'cb_int',
    path,
    ...extra,
  };
}

function makeObjMsg(type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'msg_int',
    type,
    timestamp: new Date().toISOString(),
    version: '2.0',
    sessionId: 'sess_int',
    requestId: 'req_int',
    ...extra,
  };
}

function b64(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64');
}

function unb64(b64str: string): string {
  return Buffer.from(b64str, 'base64').toString('utf8');
}

/** HTTP GET helper — returns { status, body, headers } */
async function httpGet(
  url: string,
): Promise<{ status: number; body: Buffer; headers: Record<string, string> }> {
  const resp = await fetch(url);
  const body = Buffer.from(await resp.arrayBuffer());
  const headers: Record<string, string> = {};
  resp.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: resp.status, body, headers };
}

// ---------------------------------------------------------------------------
// E2E Integration: Full flow
// ---------------------------------------------------------------------------

describe('E2E integration: full file system flow', () => {
  const ws1 = 'ws_test1';
  let volCtx: VolumeHandlerContext;
  const objScope = { workspaceId: ws1, installationId: 'inst_int' };
  beforeAll(() => {
    volCtx = makeVolCtx(ws1);
  });

  it('1. writes a file via volume request', async () => {
    const content = '# README\n\nThis is a test file for E2E integration.';
    const resp = await handleVolumeRequest(
      volCtx,
      makeVolMsg('file_volume_write_file', 'docs/readme.md', { data: b64(content) }),
    );
    expect(resp!.success).toBe(true);
  });

  it('2. reads the file back via volume request — content is identical', async () => {
    const resp = await handleVolumeRequest(
      volCtx,
      makeVolMsg('file_volume_read_file', 'docs/readme.md'),
    );
    expect(resp!.success).toBe(true);
    expect(unb64(resp!.data as string)).toBe(
      '# README\n\nThis is a test file for E2E integration.',
    );
  });

  it('3. stats the file — correct size and type', async () => {
    const resp = await handleVolumeRequest(
      volCtx,
      makeVolMsg('file_volume_stat', 'docs/readme.md'),
    );
    expect(resp!.success).toBe(true);
    const stat = resp!.stat as Record<string, unknown>;
    expect(stat.type).toBe('file');
    expect(stat.size).toBe(50); // '# README\n\nThis is a test file for E2E integration.' = 50 bytes
  });

  it('4. lists the volume directory — shows docs/', async () => {
    const resp = await handleVolumeRequest(volCtx, makeVolMsg('file_volume_read_dir', ''));
    expect(resp!.success).toBe(true);
    const entries = resp!.entries as Array<{ name: string; type: string }>;
    const docs = entries.find((e) => e.name === 'docs');
    expect(docs).toBeDefined();
    expect(docs!.type).toBe('directory');
  });

  it('5. puts an object — returns its info with a URL on this station', async () => {
    const resp = await handleObjectRequest(
      objectStore,
      objScope,
      makeObjMsg('object_put', { data: b64('shared content'), contentType: 'text/plain' }),
    );
    expect(resp).not.toBeNull();
    expect(resp!.success).toBe(true);
    expect(resp!.objectId).toMatch(/^obj_[0-9a-f]{32}$/);
    expect(resp!.url).toBe(`${baseUrl}/objects/${resp!.objectId}`);
    expect(resp!.visibility).toBe('private');
  });

  it('6. a private object is 401 without a token and 200 through a link', async () => {
    const put = await handleObjectRequest(
      objectStore,
      objScope,
      makeObjMsg('object_put', { data: b64('shared content'), contentType: 'text/plain' }),
    );
    expect((await httpGet(put!.url as string)).status).toBe(401);

    const link = await handleObjectRequest(
      objectStore,
      objScope,
      makeObjMsg('object_link', { objectId: put!.objectId, expiresIn: 60 }),
    );
    expect(link!.success).toBe(true);
    const { status, body, headers } = await httpGet(link!.url as string);
    expect(status).toBe(200);
    expect(body.toString('utf8')).toBe('shared content');
    expect(headers['content-type']).toBe('text/plain');
  });

  it('7. objects are immutable — a new version is a new object with a new URL', async () => {
    const v1 = await handleObjectRequest(
      objectStore,
      objScope,
      makeObjMsg('object_put', {
        data: b64('original'),
        contentType: 'text/plain',
        visibility: 'public',
      }),
    );
    const v2 = await handleObjectRequest(
      objectStore,
      objScope,
      makeObjMsg('object_put', {
        data: b64('modified'),
        contentType: 'text/plain',
        visibility: 'public',
      }),
    );
    expect(v1!.objectId).not.toBe(v2!.objectId);
    expect((await httpGet(v1!.url as string)).body.toString('utf8')).toBe('original');
    expect((await httpGet(v2!.url as string)).body.toString('utf8')).toBe('modified');
  });

  it('8. a public object is served permanently to anyone with the URL', async () => {
    const put = await handleObjectRequest(
      objectStore,
      objScope,
      makeObjMsg('object_put', {
        data: b64('public'),
        contentType: 'text/plain',
        visibility: 'public',
      }),
    );
    const { status, body } = await httpGet(put!.url as string);
    expect(status).toBe(200);
    expect(body.toString('utf8')).toBe('public');
  });
});

// ---------------------------------------------------------------------------
// E2E Integration: delete via HTTP
// ---------------------------------------------------------------------------

describe('E2E integration: delete object via HTTP', () => {
  it('URL works before deletion, returns 404 after', async () => {
    const scope = { workspaceId: 'ws_delete_http', installationId: 'inst_del' };
    const put = await handleObjectRequest(
      objectStore,
      scope,
      makeObjMsg('object_put', {
        data: b64('delete me'),
        contentType: 'text/plain',
        visibility: 'public',
      }),
    );
    expect((await httpGet(put!.url as string)).status).toBe(200);
    const del = await handleObjectRequest(
      objectStore,
      scope,
      makeObjMsg('object_delete', { objectId: put!.objectId }),
    );
    expect(del!.success).toBe(true);
    expect((await httpGet(put!.url as string)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// E2E Integration: link expiry via HTTP
// ---------------------------------------------------------------------------

describe('E2E integration: link expiry via HTTP', () => {
  it('a link with 1s expiry returns 401 after it expires', async () => {
    const scope = { workspaceId: 'ws_exp_http', installationId: 'inst_exp' };
    const put = await handleObjectRequest(
      objectStore,
      scope,
      makeObjMsg('object_put', { data: b64('temporary content'), contentType: 'text/plain' }),
    );
    const link = await handleObjectRequest(
      objectStore,
      scope,
      makeObjMsg('object_link', { objectId: put!.objectId, expiresIn: 1 }),
    );
    expect((await httpGet(link!.url as string)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect((await httpGet(link!.url as string)).status).toBe(401);
  }, 10000);
});

// ---------------------------------------------------------------------------
// E2E Integration: Cross-workspace isolation
// ---------------------------------------------------------------------------

describe('E2E integration: cross-workspace isolation', () => {
  const ws1 = 'ws_test1';
  const ws2 = 'ws_test2';

  it('ws_test1 has a file that ws_test2 cannot read', async () => {
    const ctx1 = makeVolCtx(ws1);
    const ctx2 = makeVolCtx(ws2);

    // Write in ws1
    await handleVolumeRequest(
      ctx1,
      makeVolMsg('file_volume_write_file', 'secret.md', { data: b64('ws1 secret') }),
    );

    // Read from ws2 should fail
    const resp = await handleVolumeRequest(ctx2, makeVolMsg('file_volume_read_file', 'secret.md'));
    expect(resp!.success).toBe(false);
  });

  it('ws_test2 cannot list ws_test1 files', async () => {
    const ctx2 = makeVolCtx(ws2);
    const resp = await handleVolumeRequest(ctx2, makeVolMsg('file_volume_read_dir', ''));
    // ws2 has its own volume root — either empty or fails, never shows ws1 files
    if (resp!.success) {
      const entries = resp!.entries as Array<{ name: string }>;
      expect(entries.find((e) => e.name === 'docs')).toBeUndefined();
      expect(entries.find((e) => e.name === 'secret.md')).toBeUndefined();
    } else {
      expect(resp!.success).toBe(false);
    }
  });

  it('an object of ws_test1 cannot be read or linked from ws_test2', async () => {
    const scope1 = { workspaceId: ws1, installationId: 'inst_x' };
    const scope2 = { workspaceId: ws2, installationId: 'inst_y' };
    const put = await handleObjectRequest(
      objectStore,
      scope1,
      makeObjMsg('object_put', { data: b64('ws1 file'), contentType: 'text/plain' }),
    );
    const get = await handleObjectRequest(
      objectStore,
      scope2,
      makeObjMsg('object_get', { objectId: put!.objectId }),
    );
    expect(get!.success).toBe(false);
    const link = await handleObjectRequest(
      objectStore,
      scope2,
      makeObjMsg('object_link', { objectId: put!.objectId, expiresIn: 60 }),
    );
    expect(link!.success).toBe(false);
    expect((await httpGet(put!.url as string)).status).toBe(401);
  });
});
