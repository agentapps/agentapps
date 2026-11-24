/**
 * Data Store implementations: the shared contract, and what is particular to
 * the local one (DATASTORE).
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type DataStore,
  dataStoreContract,
  InMemoryDataStore,
  LocalDataStore,
  ObjectStore,
  resolveMountPath,
} from '../src/index.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentapps-data-store-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A local store laid out like a workspace of the CLI. */
function local(root: string, stationId = 'stn_g'): LocalDataStore {
  return new LocalDataStore({
    stationId,
    storageDir: join(root, 'data', 'storage'),
    dataDir: join(root, 'data'),
    otherStationsDir: join(root, 'stations'),
  });
}

const implementations: Array<[string, () => DataStore]> = [
  ['InMemoryDataStore', () => new InMemoryDataStore()],
  ['LocalDataStore', () => local(mkdtempSync(join(dir, 'store-')))],
];

for (const [name, create] of implementations) {
  describe(`${name} passes the Data Store contract`, () => {
    for (const contractCase of dataStoreContract) {
      it(`[DATASTORE-AC-8] ${contractCase.name}`, () => contractCase.run(create));
    }
    it('[DATASTORE-AC-10] two Stations: separate documents and objects, one Volume', async () => {
      const shared = dataStoreContract.find((c) => c.name.startsWith('two Stations'));
      expect(shared).toBeDefined();
      await shared?.run(create);
    });
  });
}

describe('the Data Store contract', () => {
  it('[DATASTORE-AC-2] has three parts, and none of them takes a secret or Station state', () => {
    const store = new InMemoryDataStore();
    expect(Object.keys(store).sort()).toEqual(['documents', 'objects', 'volume']);
    const operations = [
      ...Object.keys(store.documents),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(store.objects)),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(store.volume)),
    ];
    for (const operation of operations) {
      expect(operation).not.toMatch(/secret|policy|apiKey|installation|token/i);
    }
  });
});

describe('LocalDataStore', () => {
  it('[DATASTORE-AC-6] serves the document, the Object and the Volume file a workspace already has', async () => {
    const before = local(dir, 'stn_before');
    const scope = { stationId: 'stn_before', workspaceId: 'default', installationId: 'ins_1' };
    await before.documents.put(scope, 'notes', 'n1', { text: 'kept' });
    const objects = new ObjectStore({
      objects: before.objects,
      stationId: 'stn_before',
      stationSecret: 's',
      publicUrl: 'http://localhost:4100',
    });
    const meta = await objects.put(scope, Buffer.from('bytes'), { contentType: 'text/plain' });
    mkdirSync(join(dir, 'data', 'ws_default', 'workspace'), { recursive: true });
    writeFileSync(join(dir, 'data', 'ws_default', 'workspace', 'report.txt'), 'report');

    // The same directory, opened again by a Station with another id.
    const after = local(dir, 'stn_after');
    const now = { ...scope, stationId: 'stn_after' };
    expect(await after.documents.get(now, 'notes', 'n1')).toEqual({ text: 'kept' });
    expect((await after.objects.read('stn_after', meta.objectId))?.toString()).toBe('bytes');
    expect((await after.objects.describe('stn_after', meta.objectId))?.installationId).toBe(
      'ins_1',
    );
    const read = await after.volume.readFile('default', 'report.txt');
    expect(Buffer.from(read.data?.data ?? '', 'base64').toString()).toBe('report');
  });

  it('[DATASTORE-AC-9] the mounted directory is the Volume itself, with no other copy', async () => {
    const store = local(dir);
    const mount = store.volume.mountPath('c');
    expect(mount).toBe(join(dir, 'data', 'ws_c', 'workspace'));

    // API mode writes; the directory has it.
    await store.volume.writeFile('c', 'from-api.txt', Buffer.from('api').toString('base64'));
    expect(readFileSync(join(mount as string, 'from-api.txt'), 'utf8')).toBe('api');

    // The directory is written; API mode reads it.
    writeFileSync(join(mount as string, 'from-mount.txt'), 'mount');
    const read = await store.volume.readFile('c', 'from-mount.txt');
    expect(Buffer.from(read.data?.data ?? '', 'base64').toString()).toBe('mount');
  });

  it('[DATASTORE-AC-7] a Data Store with no directory refuses mount mode, by name', () => {
    const { volume } = new InMemoryDataStore();
    expect(volume.mountPath('c')).toBeNull();
    const mount = { mountVolume: true, permissions: { volume: true }, volume, workspaceId: 'c' };
    expect(() => resolveMountPath(mount)).toThrow(/[Mm]ount mode/);
    // Not requested, or not permitted: nothing to refuse.
    expect(resolveMountPath({ ...mount, mountVolume: false })).toBeUndefined();
    expect(resolveMountPath({ ...mount, permissions: {} })).toBeUndefined();
    // A store with a directory hands it over.
    expect(resolveMountPath({ ...mount, volume: local(dir).volume })).toBe(
      join(dir, 'data', 'ws_c', 'workspace'),
    );
  });
});
