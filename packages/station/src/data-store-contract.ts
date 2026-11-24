/**
 * The contract every Data Store implementation passes.
 *
 * Framework-free: each case is a name and an async function that throws when
 * the store misbehaves, so any test runner can drive it:
 *
 *   for (const c of dataStoreContract) it(c.name, () => c.run(() => new MyStore()));
 *
 * @spec DATASTORE-NFR-2
 */

import assert from 'node:assert/strict';
import { ErrorCode } from '@agentapps/protocol';
import type { DataStore } from './data-store.js';
import type { StoredObjectMeta } from './file-handlers/object-store.js';

export interface DataStoreContractCase {
  name: string;
  /** `create` answers a new, empty store each time it is called. */
  run(create: () => DataStore | Promise<DataStore>): Promise<void>;
}

const G = 'stn_g';
const R = 'stn_r';
const WS = 'c';

const A = { stationId: G, workspaceId: WS, installationId: 'ins_a' };
const B = { stationId: G, workspaceId: WS, installationId: 'ins_b' };

function object(
  id: string,
  scope: { workspaceId: string; installationId: string },
): StoredObjectMeta {
  return {
    objectId: id,
    url: `https://station.example.com/objects/${id}`,
    size: 5,
    contentType: 'text/plain',
    visibility: 'private',
    createdAt: new Date().toISOString(),
    workspaceId: scope.workspaceId,
    installationId: scope.installationId,
  };
}

const OBJ_1 = `obj_${'1'.repeat(32)}`;
const OBJ_2 = `obj_${'2'.repeat(32)}`;
const b64 = (text: string): string => Buffer.from(text).toString('base64');

export const dataStoreContract: DataStoreContractCase[] = [
  {
    name: 'documents: put, get, query, update and delete',
    async run(create) {
      const { documents } = await create();
      assert.equal(await documents.get(A, 'notes', 'n1'), null);
      await documents.put(A, 'notes', 'n1', { title: 'one', done: false });
      await documents.put(A, 'notes', 'n2', { title: 'two', done: true });
      assert.deepEqual(await documents.get(A, 'notes', 'n1'), { title: 'one', done: false });
      const done = await documents.query(A, 'notes', { filter: { done: true } });
      assert.deepEqual(
        done.documents.map((d) => d.title),
        ['two'],
      );
      assert.deepEqual(await documents.update(A, 'notes', 'n1', { done: true }), {
        title: 'one',
        done: true,
      });
      assert.equal(await documents.update(A, 'notes', 'absent', { done: true }), null);
      await documents.delete(A, 'notes', 'n1');
      assert.equal(await documents.get(A, 'notes', 'n1'), null);
    },
  },
  {
    // @spec DATASTORE-NFR-1
    name: 'a document written for one Installation is not returned for another',
    async run(create) {
      const { documents } = await create();
      await documents.put(A, 'notes', 'n1', { title: 'of a' });
      assert.equal(await documents.get(B, 'notes', 'n1'), null);
      assert.deepEqual((await documents.query(B, 'notes')).documents, []);
      await documents.delete(B, 'notes', 'n1');
      assert.deepEqual(await documents.get(A, 'notes', 'n1'), { title: 'of a' });
    },
  },
  {
    name: 'objects: put, describe, read, list and delete',
    async run(create) {
      const { objects } = await create();
      assert.equal(await objects.describe(G, OBJ_1), null);
      assert.equal(await objects.read(G, OBJ_1), null);
      await objects.put(A, object(OBJ_1, A), Buffer.from('hello'));
      assert.equal((await objects.describe(G, OBJ_1))?.installationId, 'ins_a');
      assert.equal((await objects.read(G, OBJ_1))?.toString(), 'hello');
      assert.deepEqual(
        (await objects.list(A)).map((m) => m.objectId),
        [OBJ_1],
      );
      assert.deepEqual(await objects.list(B), []);
      // Only the owning Installation removes it.
      assert.equal(await objects.delete(B, OBJ_1), false);
      assert.equal(await objects.delete(A, OBJ_1), true);
      assert.equal(await objects.describe(G, OBJ_1), null);
      assert.equal(await objects.read(G, OBJ_1), null);
    },
  },
  {
    name: 'volume: write, read, stat, list, mkdir and delete',
    async run(create) {
      const { volume } = await create();
      assert.equal((await volume.readFile(WS, 'absent.txt')).success, false);
      assert.equal((await volume.writeFile(WS, 'reports/a.txt', b64('alpha'))).success, true);
      const read = await volume.readFile(WS, 'reports/a.txt');
      assert.equal(Buffer.from(read.data?.data ?? '', 'base64').toString(), 'alpha');
      assert.equal(read.data?.size, 5);
      const stat = await volume.stat(WS, 'reports/a.txt');
      assert.equal(stat.data?.type, 'file');
      assert.equal(stat.data?.path, 'reports/a.txt');
      assert.equal((await volume.stat(WS, 'reports')).data?.type, 'directory');
      assert.deepEqual(
        (await volume.readDir(WS, 'reports')).data?.map((e) => `${e.type}:${e.name}`),
        ['file:a.txt'],
      );
      assert.deepEqual(
        (await volume.readDir(WS, '')).data?.map((e) => `${e.type}:${e.name}`),
        ['directory:reports'],
      );
      assert.equal((await volume.mkdir(WS, 'empty/inner')).success, true);
      assert.equal((await volume.stat(WS, 'empty/inner')).data?.type, 'directory');
      assert.equal((await volume.delete(WS, 'reports', false)).success, false);
      assert.equal((await volume.delete(WS, 'reports', true)).success, true);
      assert.equal((await volume.readFile(WS, 'reports/a.txt')).success, false);
    },
  },
  {
    // @spec DATASTORE-NFR-1
    name: 'volume: a path that escapes the root is refused, and Workspaces do not mix',
    async run(create) {
      const { volume } = await create();
      await volume.writeFile(WS, 'mine.txt', b64('mine'));
      for (const path of ['../mine.txt', '/etc/passwd', 'a/../../b']) {
        const read = await volume.readFile(WS, path);
        assert.equal(read.success, false, path);
        assert.equal(read.errorCode, ErrorCode.INVALID_ARGUMENTS, path);
        const write = await volume.writeFile(WS, path, b64('x'));
        assert.equal(write.errorCode, ErrorCode.INVALID_ARGUMENTS, path);
      }
      assert.equal((await volume.readFile('other', 'mine.txt')).success, false);
    },
  },
  {
    // @spec DATASTORE-REQ-9
    name: 'two Stations on one store: separate documents and objects, one Volume per Workspace',
    async run(create) {
      const { documents, objects, volume } = await create();
      const onG = { stationId: G, workspaceId: WS, installationId: 'ins_1' };
      const onR = { stationId: R, workspaceId: WS, installationId: 'ins_1' };

      await documents.put(onG, 'notes', 'n1', { of: 'g' });
      assert.equal(await documents.get(onR, 'notes', 'n1'), null);
      await documents.put(onR, 'notes', 'n1', { of: 'r' });
      await documents.delete(onR, 'notes', 'n1');
      assert.deepEqual(await documents.get(onG, 'notes', 'n1'), { of: 'g' });

      await objects.put(onG, object(OBJ_1, onG), Buffer.from('of g'));
      assert.equal(await objects.describe(R, OBJ_1), null);
      assert.equal(await objects.read(R, OBJ_1), null);
      assert.deepEqual(await objects.list(onR), []);
      assert.equal(await objects.delete(onR, OBJ_1), false);
      await objects.put(onR, object(OBJ_2, onR), Buffer.from('of r'));
      assert.equal(await objects.describe(G, OBJ_2), null);
      assert.equal((await objects.read(G, OBJ_1))?.toString(), 'of g');

      // The Volume takes no Station: the Workspace has one.
      await volume.writeFile(WS, 'shared.txt', b64('shared'));
      assert.equal(
        Buffer.from(
          (await volume.readFile(WS, 'shared.txt')).data?.data ?? '',
          'base64',
        ).toString(),
        'shared',
      );
    },
  },
];
