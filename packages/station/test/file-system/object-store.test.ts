/**
 * Tests for the ObjectStore and the object Requests.
 *
 * Covers: put/get/delete/list/link on disk, immutability, Installation and
 * Workspace scoping, visibility, the link token and the request dispatcher.
 */

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  generateObjectId,
  handleObjectRequest,
  ObjectStore,
  toObjectInfo,
} from '../../src/file-handlers/object-store.js';
import {
  createObjectLinkToken,
  validateObjectLinkToken,
} from '../../src/file-handlers/signed-url.js';

let tempBase: string;
let store: ObjectStore;
const SECRET = 'object-store-test-secret';
const PUBLIC_URL = 'http://localhost:9999';
const scope = { workspaceId: 'ws_a', installationId: 'inst_1' };
const sibling = { workspaceId: 'ws_a', installationId: 'inst_2' };
const stranger = { workspaceId: 'ws_b', installationId: 'inst_3' };

beforeAll(async () => {
  tempBase = await mkdtemp(join(tmpdir(), 'agentapps-objects-'));
  store = new ObjectStore({
    volumesBasePath: tempBase,
    stationSecret: SECRET,
    publicUrl: PUBLIC_URL,
  });
});

afterAll(async () => {
  await rm(tempBase, { recursive: true, force: true });
});

describe('ObjectStore', () => {
  it('put writes the blob, its meta and an index entry, and returns the info', async () => {
    const meta = await store.put(scope, Buffer.from('hello'), {
      contentType: 'text/plain',
      filename: 'hello.txt',
      metadata: { origin: 'test' },
    });
    expect(meta.objectId).toMatch(/^obj_[0-9a-f]{32}$/);
    expect(meta.url).toBe(`${PUBLIC_URL}/objects/${meta.objectId}`);
    expect(meta.size).toBe(5);
    expect(meta.visibility).toBe('private');
    expect(meta.filename).toBe('hello.txt');
    expect(meta.metadata).toEqual({ origin: 'test' });

    const dir = join(tempBase, 'ws_ws_a', 'objects', 'inst_1');
    expect((await stat(join(dir, meta.objectId))).isFile()).toBe(true);
    expect((await stat(join(dir, `${meta.objectId}.meta.json`))).isFile()).toBe(true);
    expect((await stat(join(tempBase, '_objects', `${meta.objectId}.json`))).isFile()).toBe(true);
    expect(await readFile(join(dir, meta.objectId), 'utf8')).toBe('hello');
  });

  it('toObjectInfo strips the owner fields', async () => {
    const meta = await store.put(scope, Buffer.from('x'), { contentType: 'text/plain' });
    const info = toObjectInfo(meta) as Record<string, unknown>;
    expect(info.workspaceId).toBeUndefined();
    expect(info.installationId).toBeUndefined();
    expect(info.objectId).toBe(meta.objectId);
  });

  it('get is allowed for any installation of the same workspace and denied across workspaces', async () => {
    const meta = await store.put(scope, Buffer.from('ws-private'), { contentType: 'text/plain' });
    expect((await store.get(scope, meta.objectId))?.data.toString('utf8')).toBe('ws-private');
    expect((await store.get(sibling, meta.objectId))?.data.toString('utf8')).toBe('ws-private');
    expect(await store.get(stranger, meta.objectId)).toBeNull();
    expect(await store.get(scope, 'obj_' + '0'.repeat(32))).toBeNull();
    expect(await store.get(scope, '../../etc/passwd')).toBeNull();
  });

  it('objects are immutable: two puts of the same content are two objects', async () => {
    const a = await store.put(scope, Buffer.from('same'), { contentType: 'text/plain' });
    const b = await store.put(scope, Buffer.from('same'), { contentType: 'text/plain' });
    expect(a.objectId).not.toBe(b.objectId);
    expect(generateObjectId()).not.toBe(generateObjectId());
  });

  it('delete is allowed only for the owning installation', async () => {
    const meta = await store.put(scope, Buffer.from('bye'), { contentType: 'text/plain' });
    expect(await store.delete(sibling, meta.objectId)).toBe(false);
    expect(await store.delete(stranger, meta.objectId)).toBe(false);
    expect(await store.delete(scope, meta.objectId)).toBe(true);
    expect(await store.get(scope, meta.objectId)).toBeNull();
    expect(await store.describe(meta.objectId)).toBeNull();
    expect(await store.delete(scope, meta.objectId)).toBe(false);
  });

  it("list returns the installation's objects newest first with a cursor", async () => {
    const listScope = { workspaceId: 'ws_list', installationId: 'inst_list' };
    const ids: string[] = [];
    for (const text of ['1', '2', '3']) {
      ids.push(
        (await store.put(listScope, Buffer.from(text), { contentType: 'text/plain' })).objectId,
      );
      await new Promise((r) => setTimeout(r, 5));
    }
    const page1 = await store.list(listScope, { limit: 2 });
    expect(page1.objects.map((o) => o.objectId)).toEqual([ids[2], ids[1]]);
    expect(page1.nextCursor).toBe(ids[1]);
    const page2 = await store.list(listScope, { cursor: page1.nextCursor });
    expect(page2.objects.map((o) => o.objectId)).toEqual([ids[0]]);
    expect(page2.nextCursor).toBeUndefined();
    expect(
      (await store.list({ workspaceId: 'ws_list', installationId: 'inst_none' })).objects,
    ).toEqual([]);
  });

  it('link signs a token bound to the object id and the expiry', async () => {
    const meta = await store.put(scope, Buffer.from('linked'), { contentType: 'text/plain' });
    const link = await store.link(scope, meta.objectId, 60);
    expect(link?.url.startsWith(`${meta.url}?token=`)).toBe(true);
    const token = new URL(link!.url).searchParams.get('token')!;
    const check = validateObjectLinkToken(token, SECRET);
    expect(check.valid).toBe(true);
    expect(check.payload?.objectId).toBe(meta.objectId);
    expect(check.payload?.expiresAt).toBe(link!.expiresAt);
    expect(validateObjectLinkToken(token, 'other-secret').valid).toBe(false);
    expect(await store.link(stranger, meta.objectId, 60)).toBeNull();
  });

  it('resolveForServing: public anyone, private needs a valid token for that id', async () => {
    const pub = await store.put(scope, Buffer.from('pub'), {
      contentType: 'text/plain',
      visibility: 'public',
    });
    const priv = await store.put(scope, Buffer.from('priv'), { contentType: 'text/plain' });

    expect((await store.resolveForServing(pub.objectId)).status).toBe(200);
    expect((await store.resolveForServing(priv.objectId)).status).toBe(401);
    expect((await store.resolveForServing('obj_' + 'a'.repeat(32))).status).toBe(404);

    const good = createObjectLinkToken(
      { objectId: priv.objectId, expiresAt: new Date(Date.now() + 60_000).toISOString() },
      SECRET,
    );
    expect((await store.resolveForServing(priv.objectId, good)).status).toBe(200);

    const forOther = createObjectLinkToken(
      { objectId: pub.objectId, expiresAt: new Date(Date.now() + 60_000).toISOString() },
      SECRET,
    );
    expect((await store.resolveForServing(priv.objectId, forOther)).status).toBe(401);

    const expired = createObjectLinkToken(
      { objectId: priv.objectId, expiresAt: new Date(Date.now() - 1_000).toISOString() },
      SECRET,
    );
    expect((await store.resolveForServing(priv.objectId, expired)).status).toBe(401);
    expect((await store.resolveForServing(priv.objectId, 'garbage')).status).toBe(401);
  });
});

describe('handleObjectRequest', () => {
  function msg(type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'm1',
      type,
      timestamp: new Date().toISOString(),
      version: '2.0',
      sessionId: 'sess_obj',
      requestId: 'req_obj',
      ...extra,
    };
  }

  it('answers put, get, list, link and delete with *_result messages', async () => {
    const put = await handleObjectRequest(
      store,
      scope,
      msg('object_put', {
        data: Buffer.from('dispatch').toString('base64'),
        contentType: 'text/plain',
        filename: 'd.txt',
      }),
    );
    expect(put?.type).toBe('object_put_result');
    expect(put?.success).toBe(true);
    expect(put?.requestId).toBe('req_obj');
    const objectId = put?.objectId as string;

    const get = await handleObjectRequest(store, sibling, msg('object_get', { objectId }));
    expect(get?.type).toBe('object_get_result');
    expect(Buffer.from(get?.data as string, 'base64').toString('utf8')).toBe('dispatch');
    expect(get?.filename).toBe('d.txt');
    expect((get as Record<string, unknown>).workspaceId).toBeUndefined();

    const list = await handleObjectRequest(store, scope, msg('object_list', { limit: 1 }));
    expect(list?.type).toBe('object_list_result');
    expect((list?.objects as unknown[]).length).toBe(1);

    const link = await handleObjectRequest(
      store,
      scope,
      msg('object_link', { objectId, expiresIn: 30 }),
    );
    expect(link?.type).toBe('object_link_result');
    expect((link?.url as string).includes('?token=')).toBe(true);

    const del = await handleObjectRequest(store, scope, msg('object_delete', { objectId }));
    expect(del).toMatchObject({ type: 'object_delete_result', success: true });
    const gone = await handleObjectRequest(store, scope, msg('object_get', { objectId }));
    expect(gone).toMatchObject({ success: false, error: 'Object not found' });
  });

  it('returns null for types outside the family', async () => {
    expect(
      await handleObjectRequest(store, scope, msg('file_volume_stat', { path: 'x' })),
    ).toBeNull();
  });
});
