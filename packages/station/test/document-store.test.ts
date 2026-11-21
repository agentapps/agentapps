/**
 * Tests for the Storage backends: in-memory and file-backed document stores,
 * paging, filters, partial updates and the request handler's response shapes.
 */

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FileDocumentStore,
  handleStorageRequest,
  InMemoryDocumentStore,
  pageDocuments,
  STORAGE_DEFAULT_LIMIT,
  STORAGE_MAX_LIMIT,
} from '../src/document-store.js';

const INST = 'inst_1';

describe('InMemoryDocumentStore', () => {
  it('put replaces, get returns a copy, delete succeeds on missing ids', async () => {
    const store = new InMemoryDocumentStore();
    await store.put(INST, 'nodes', 'n1', { text: 'a', done: false });
    await store.put(INST, 'nodes', 'n1', { text: 'b' });
    const doc = await store.get(INST, 'nodes', 'n1');
    expect(doc).toEqual({ text: 'b' });
    if (doc) doc.text = 'mutated';
    expect(await store.get(INST, 'nodes', 'n1')).toEqual({ text: 'b' });
    expect(await store.delete(INST, 'nodes', 'nope')).toBe(true);
    expect(await store.delete(INST, 'nodes', 'n1')).toBe(true);
    expect(await store.get(INST, 'nodes', 'n1')).toBeNull();
  });

  it('scopes collections by installation', async () => {
    const store = new InMemoryDocumentStore();
    await store.put('a', 'nodes', 'n1', { owner: 'a' });
    await store.put('b', 'nodes', 'n1', { owner: 'b' });
    expect(await store.get('a', 'nodes', 'n1')).toEqual({ owner: 'a' });
    expect((await store.query('b', 'nodes')).documents).toEqual([{ owner: 'b' }]);
  });

  it('update merges top-level fields and returns null when missing', async () => {
    const store = new InMemoryDocumentStore();
    await store.put(INST, 'nodes', 'n1', { text: 'a', done: false, log: [] });
    expect(await store.update(INST, 'nodes', 'n1', { done: true, _internal: 1 })).toEqual({
      text: 'a',
      done: true,
      log: [],
    });
    expect(await store.update(INST, 'nodes', 'missing', { done: true })).toBeNull();
  });

  it('ignores internal keys on put', async () => {
    const store = new InMemoryDocumentStore();
    await store.put(INST, 'nodes', 'n1', { text: 'a', _installationId: 'spoof' });
    expect(await store.get(INST, 'nodes', 'n1')).toEqual({ text: 'a' });
  });

  it('query filters by equality on top-level fields, null matching missing', async () => {
    const store = new InMemoryDocumentStore();
    await store.put(INST, 'nodes', 'r', { text: 'root', parentId: null });
    await store.put(INST, 'nodes', 'c1', { text: 'c1', parentId: 'r', done: true });
    await store.put(INST, 'nodes', 'c2', { text: 'c2', parentId: 'r', done: false });
    await store.put(INST, 'nodes', 'orphan', { text: 'no parent field' });
    const roots = await store.query(INST, 'nodes', { filter: { parentId: null } });
    expect(roots.documents.map((d) => d.text)).toEqual(['root', 'no parent field']);
    const done = await store.query(INST, 'nodes', { filter: { parentId: 'r', done: true } });
    expect(done.documents.map((d) => d.text)).toEqual(['c1']);
    const all = await store.query(INST, 'nodes');
    expect(all.documents).toHaveLength(4);
    expect(all.nextCursor).toBeUndefined();
  });
});

describe('pageDocuments', () => {
  const docs = Array.from({ length: 250 }, (_, i) => ({ i }));

  it('pages with an opaque cursor and the default limit', () => {
    const first = pageDocuments(docs);
    expect(first.documents).toHaveLength(STORAGE_DEFAULT_LIMIT);
    expect(first.nextCursor).toBeDefined();
    const second = pageDocuments(docs, { cursor: first.nextCursor });
    expect(second.documents[0]).toEqual({ i: 100 });
    const third = pageDocuments(docs, { cursor: second.nextCursor });
    expect(third.documents).toHaveLength(50);
    expect(third.nextCursor).toBeUndefined();
  });

  it('caps the limit and rejects a bad cursor', () => {
    const big = Array.from({ length: STORAGE_MAX_LIMIT + 5 }, (_, i) => ({ i }));
    expect(pageDocuments(big, { limit: 5000 }).documents).toHaveLength(STORAGE_MAX_LIMIT);
    expect(() => pageDocuments(docs, { cursor: 'not-a-number' })).toThrow('Invalid cursor');
  });
});

describe('FileDocumentStore', () => {
  let dir: string;
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists one JSON file per installation and collection and reloads it', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agentapps-docstore-'));
    const store = new FileDocumentStore(dir);
    await store.put(INST, 'nodes', 'n1', { text: 'a' });
    await store.put(INST, 'kv', 'installed', { key: 'installed', value: { at: 1 } });
    await store.update(INST, 'nodes', 'n1', { done: true });

    const files = readdirSync(join(dir, INST));
    expect(files).toHaveLength(2);
    const nodesFile = join(dir, INST, `${Buffer.from('nodes').toString('base64url')}.json`);
    expect(existsSync(nodesFile)).toBe(true);
    expect(JSON.parse(readFileSync(nodesFile, 'utf8'))).toEqual({ n1: { text: 'a', done: true } });

    const reopened = new FileDocumentStore(dir);
    expect(await reopened.get(INST, 'nodes', 'n1')).toEqual({ text: 'a', done: true });
    expect((await reopened.query(INST, 'kv')).documents).toEqual([
      { key: 'installed', value: { at: 1 } },
    ]);
    await reopened.delete(INST, 'nodes', 'n1');
    expect(JSON.parse(readFileSync(nodesFile, 'utf8'))).toEqual({});
  });

  it("[CLI-AC-3] two processes on the same directory see each other's writes", async () => {
    dir = mkdtempSync(join(tmpdir(), 'agentapps-docstore-'));
    // One store per process: the long-running station and a one-shot CLI call.
    const station = new FileDocumentStore(dir);
    await station.put(INST, 'nodes', 'root', { text: 'My Tasks' });
    expect((await station.query(INST, 'nodes')).documents).toHaveLength(1);

    const cli = new FileDocumentStore(dir);
    await cli.put(INST, 'nodes', 'work', { text: 'Work' });
    expect(await station.get(INST, 'nodes', 'work')).toEqual({ text: 'Work' });

    await station.update(INST, 'nodes', 'work', { done: true });
    expect(await new FileDocumentStore(dir).get(INST, 'nodes', 'work')).toEqual({
      text: 'Work',
      done: true,
    });
    expect((await cli.query(INST, 'nodes')).documents).toHaveLength(2);
  });

  it('[CLI-AC-3] a write that leaves the mtime untouched is still seen', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agentapps-docstore-'));
    const station = new FileDocumentStore(dir);
    await station.put(INST, 'nodes', 'root', { text: 'My Tasks' });

    // Pin the file's timestamp to a whole second, then read it back so the
    // store records exactly that timestamp.
    const collectionFile = join(dir, INST, `${Buffer.from('nodes').toString('base64url')}.json`);
    const pinned = new Date(1_600_000_000_000);
    utimesSync(collectionFile, pinned, pinned);
    await station.get(INST, 'nodes', 'root');

    // Another process rewrites the collection and the timestamp lands on the
    // very same tick, so mtime alone cannot tell the two writes apart.
    const documents = JSON.parse(readFileSync(collectionFile, 'utf8')) as Record<string, unknown>;
    documents.work = { text: 'Work' };
    writeFileSync(collectionFile, `${JSON.stringify(documents, null, 2)}\n`, 'utf8');
    utimesSync(collectionFile, pinned, pinned);

    expect(await station.get(INST, 'nodes', 'work')).toEqual({ text: 'Work' });
  });
});

describe('handleStorageRequest', () => {
  it('answers each request with the Teros response shape', async () => {
    const store = new InMemoryDocumentStore();
    const put = await handleStorageRequest(store, INST, {
      type: 'storage_put',
      collection: 'nodes',
      documentId: 'n1',
      document: { text: 'a' },
    });
    expect(put).toEqual({
      type: 'storage_put_response',
      fields: { success: true, documentId: 'n1' },
    });
    expect(
      await handleStorageRequest(store, INST, {
        type: 'storage_get',
        collection: 'nodes',
        documentId: 'n1',
      }),
    ).toEqual({ type: 'storage_get_response', fields: { success: true, document: { text: 'a' } } });
    expect(
      await handleStorageRequest(store, INST, { type: 'storage_query', collection: 'nodes' }),
    ).toEqual({
      type: 'storage_query_response',
      fields: { success: true, documents: [{ text: 'a' }] },
    });
    expect(
      await handleStorageRequest(store, INST, {
        type: 'storage_update',
        collection: 'nodes',
        documentId: 'missing',
        patch: { x: 1 },
      }),
    ).toEqual({
      type: 'storage_update_response',
      fields: { success: false, document: null, error: 'Document not found' },
    });
    expect(
      await handleStorageRequest(store, INST, {
        type: 'storage_query',
        collection: 'nodes',
        cursor: '!!',
      }),
    ).toEqual({
      type: 'storage_query_response',
      fields: { success: false, documents: [], error: 'Invalid cursor' },
    });
    expect(
      await handleStorageRequest(store, INST, {
        type: 'storage_delete',
        collection: 'nodes',
        documentId: 'n1',
      }),
    ).toEqual({ type: 'storage_delete_response', fields: { success: true } });
    await expect(handleStorageRequest(store, INST, { type: 'storage_set' })).rejects.toThrow(
      'Unknown storage request',
    );
  });
});
