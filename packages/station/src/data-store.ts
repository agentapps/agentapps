/**
 * Data Store — what Apps store that is not a secret: documents, Objects and
 * the Volume.
 *
 * A Station is given exactly one, with the three parts, and is the only
 * component that talks to it. Documents and Objects are tied to a Station, a
 * Workspace and an Installation; the Volume to a Workspace only, so the same
 * Workspace sees one Volume from every Station that shares the Data Store.
 *
 * Two implementations ship here: `InMemoryDataStore` for tests and
 * `LocalDataStore`, a directory.
 */

import { join, resolve } from 'node:path';
import type { StorageDocument } from '@agentapps/protocol';
import {
  type DocumentStore,
  FileDocumentStore,
  InMemoryDocumentStore,
  type StoragePage,
  type StorageQuery,
} from './document-store.js';
import {
  InMemoryObjectsStore,
  LocalObjectsStore,
  type ObjectsStore,
} from './file-handlers/object-store.js';
import {
  InMemoryVolumeStore,
  LocalVolumeStore,
  type VolumeStore,
} from './file-handlers/volume-handlers.js';

/** What documents and Objects are tied to. */
export interface InstallationDataScope {
  stationId: string;
  workspaceId: string;
  installationId: string;
}

/**
 * The documents part of a Data Store: the operations of Storage, per
 * Installation of a Workspace on a Station.
 *
 * @spec DATASTORE-REQ-3
 */
export interface DocumentsStore {
  put(
    scope: InstallationDataScope,
    collection: string,
    documentId: string,
    document: StorageDocument,
  ): Promise<void>;
  get(
    scope: InstallationDataScope,
    collection: string,
    documentId: string,
  ): Promise<StorageDocument | null>;
  query(
    scope: InstallationDataScope,
    collection: string,
    query?: StorageQuery,
  ): Promise<StoragePage>;
  update(
    scope: InstallationDataScope,
    collection: string,
    documentId: string,
    patch: StorageDocument,
  ): Promise<StorageDocument | null>;
  delete(scope: InstallationDataScope, collection: string, documentId: string): Promise<boolean>;
}

/**
 * The Data Store contract: one object with three parts. It keeps app data
 * and nothing else: no secrets, Installations, API Keys or Policies.
 *
 * @spec DATASTORE-REQ-1
 * @spec DATASTORE-REQ-2
 * @spec DATASTORE-REQ-3
 */
export interface DataStore {
  readonly documents: DocumentsStore;
  readonly objects: ObjectsStore;
  readonly volume: VolumeStore;
}

/** A `DocumentsStore` over per-Installation stores chosen by `pick`. */
function documentsOver(
  pick: (scope: InstallationDataScope) => { store: DocumentStore; key: string },
): DocumentsStore {
  return {
    put(scope, collection, documentId, document) {
      const { store, key } = pick(scope);
      return store.put(key, collection, documentId, document);
    },
    get(scope, collection, documentId) {
      const { store, key } = pick(scope);
      return store.get(key, collection, documentId);
    },
    query(scope, collection, query) {
      const { store, key } = pick(scope);
      return store.query(key, collection, query);
    },
    update(scope, collection, documentId, patch) {
      const { store, key } = pick(scope);
      return store.update(key, collection, documentId, patch);
    },
    delete(scope, collection, documentId) {
      const { store, key } = pick(scope);
      return store.delete(key, collection, documentId);
    },
  };
}

/**
 * The documents of one Installation as the plain `DocumentStore` the Storage
 * Request handler works with.
 * @spec DATASTORE-REQ-5
 */
export function documentsOf(
  documents: DocumentsStore,
  scope: InstallationDataScope,
): DocumentStore {
  return {
    put: (_id, collection, documentId, document) =>
      documents.put(scope, collection, documentId, document),
    get: (_id, collection, documentId) => documents.get(scope, collection, documentId),
    query: (_id, collection, query) => documents.query(scope, collection, query),
    update: (_id, collection, documentId, patch) =>
      documents.update(scope, collection, documentId, patch),
    delete: (_id, collection, documentId) => documents.delete(scope, collection, documentId),
  };
}

/**
 * A Data Store that keeps everything in process memory and has no directory
 * to mount. For tests.
 *
 * @spec DATASTORE-NFR-2
 */
export class InMemoryDataStore implements DataStore {
  readonly documents: DocumentsStore;
  readonly objects: ObjectsStore = new InMemoryObjectsStore();
  readonly volume: VolumeStore = new InMemoryVolumeStore();

  constructor() {
    const store = new InMemoryDocumentStore();
    this.documents = documentsOver((scope) => ({
      store,
      key: JSON.stringify([scope.stationId, scope.workspaceId, scope.installationId]),
    }));
  }
}

/** Where a `LocalDataStore` keeps the data of the Station it belongs to. */
export interface LocalDataStoreOptions {
  /**
   * The Station this directory belongs to. Its documents and Objects live at
   * the paths below, whatever its id; any other Station's go under
   * `otherStationsDir`.
   */
  stationId: string;
  /** Directory of the documents: one folder per Installation. */
  storageDir: string;
  /** Directory of Objects and of the Volume (`ws_{workspaceId}/…`). */
  dataDir: string;
  /** Directory for the documents and Objects of Stations other than `stationId`. */
  otherStationsDir: string;
  /**
   * A Workspace whose files are kept under another name, as
   * `{ id: 'ws_3f…', directory: 'default' }`: a workspace of the CLI has
   * always kept its one Workspace's Volume and Objects under `ws_default/`.
   */
  workspaceAlias?: { id: string; directory: string };
}

function safeName(id: string): string {
  if (id === '' || id === '.' || id === '..' || /[/\\\0]/.test(id)) {
    throw new Error(`Not usable as a name in the Data Store: ${JSON.stringify(id)}`);
  }
  return id;
}

/**
 * A Data Store that keeps everything in a directory.
 *
 * The directory belongs to one Station, so that Station's documents and
 * Objects need no id in their paths: they are where a workspace has always
 * kept them. The Volume is the Workspace's and has one place for every Station.
 *
 * @spec DATASTORE-REQ-7
 */
export class LocalDataStore implements DataStore {
  readonly documents: DocumentsStore;
  readonly objects: ObjectsStore;
  readonly volume: VolumeStore;

  constructor(options: LocalDataStoreOptions) {
    const dataDir = resolve(options.dataDir);
    const home = new FileDocumentStore(resolve(options.storageDir));
    const others = new Map<string, DocumentStore>();
    const otherBase = (stationId: string): string =>
      join(resolve(options.otherStationsDir), safeName(stationId));

    this.documents = documentsOver((scope) => {
      const key = safeName(scope.installationId);
      if (scope.stationId === options.stationId) return { store: home, key };
      let store = others.get(scope.stationId);
      if (!store) {
        store = new FileDocumentStore(join(otherBase(scope.stationId), 'storage'));
        others.set(scope.stationId, store);
      }
      return { store, key };
    });
    const objects = new LocalObjectsStore((stationId) =>
      stationId === options.stationId ? dataDir : join(otherBase(stationId), 'data'),
    );
    const volume = new LocalVolumeStore(dataDir);
    const alias = options.workspaceAlias;
    this.objects = alias ? aliasedObjects(objects, alias) : objects;
    this.volume = alias ? aliasedVolume(volume, alias) : volume;
  }
}

type WorkspaceAlias = { id: string; directory: string };

/** The Volume with one Workspace kept under another directory name. */
function aliasedVolume(volume: VolumeStore, alias: WorkspaceAlias): VolumeStore {
  const dir = (workspaceId: string): string =>
    workspaceId === alias.id ? alias.directory : workspaceId;
  return {
    readDir: (ws, path) => volume.readDir(dir(ws), path),
    readFile: (ws, path) => volume.readFile(dir(ws), path),
    writeFile: (ws, path, data) => volume.writeFile(dir(ws), path, data),
    delete: (ws, path, recursive) => volume.delete(dir(ws), path, recursive),
    stat: (ws, path) => volume.stat(dir(ws), path),
    mkdir: (ws, path) => volume.mkdir(dir(ws), path),
    mountPath: (ws) => volume.mountPath(dir(ws)),
  };
}

/** Objects with one Workspace kept under another directory name, on disk and in their metadata. */
function aliasedObjects(objects: ObjectsStore, alias: WorkspaceAlias): ObjectsStore {
  const dir = (workspaceId: string): string =>
    workspaceId === alias.id ? alias.directory : workspaceId;
  const id = (directory: string): string => (directory === alias.directory ? alias.id : directory);
  const out = <T extends { workspaceId: string }>(value: T): T => ({
    ...value,
    workspaceId: dir(value.workspaceId),
  });
  const back = <T extends { workspaceId: string }>(value: T): T => ({
    ...value,
    workspaceId: id(value.workspaceId),
  });
  return {
    put: (scope, meta, data) => objects.put(out(scope), out(meta), data),
    describe: async (stationId, objectId) => {
      const meta = await objects.describe(stationId, objectId);
      return meta ? back(meta) : null;
    },
    read: (stationId, objectId) => objects.read(stationId, objectId),
    delete: (scope, objectId) => objects.delete(out(scope), objectId),
    list: async (scope) => (await objects.list(out(scope))).map(back),
  };
}
