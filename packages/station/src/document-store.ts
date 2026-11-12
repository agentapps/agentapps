/**
 * Storage — the document store a Host keeps for each Installation.
 *
 * Named collections of JSON documents with an id, queried by equality on
 * top-level fields and paged with an opaque cursor; `update` merges top-level
 * fields. Every operation is scoped by installationId. Field names and
 * semantics match the Teros backend so an app behaves the same under both.
 *
 * Two implementations:
 * - `InMemoryDocumentStore`: the Station's dev/standalone store.
 * - `FileDocumentStore`: the CLI's persistent store, one JSON file per
 *   installation and collection under the local data directory.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { StorageDocument } from '@agentapps/protocol';

/** Default page size when a query does not set `limit`. */
export const STORAGE_DEFAULT_LIMIT = 100;
/** Largest page a query may ask for. */
export const STORAGE_MAX_LIMIT = 1000;

export interface StorageQuery {
  filter?: Record<string, unknown>;
  limit?: number;
  cursor?: string;
}

export interface StoragePage {
  documents: StorageDocument[];
  nextCursor?: string;
}

/** The operations a Storage backend provides, all scoped by installationId. */
export interface DocumentStore {
  put(
    installationId: string,
    collection: string,
    documentId: string,
    document: StorageDocument,
  ): Promise<void>;
  get(
    installationId: string,
    collection: string,
    documentId: string,
  ): Promise<StorageDocument | null>;
  query(installationId: string, collection: string, query?: StorageQuery): Promise<StoragePage>;
  update(
    installationId: string,
    collection: string,
    documentId: string,
    patch: StorageDocument,
  ): Promise<StorageDocument | null>;
  delete(installationId: string, collection: string, documentId: string): Promise<boolean>;
}

/** Keys the app may not set or filter on: reserved for the backend, as in Teros. */
function isInternalKey(key: string): boolean {
  return key.startsWith('_');
}

function stripInternal(document: StorageDocument): StorageDocument {
  const out: StorageDocument = {};
  for (const [key, value] of Object.entries(document)) {
    if (!isInternalKey(key)) out[key] = value;
  }
  return out;
}

function matches(document: StorageDocument, filter: Record<string, unknown> | undefined): boolean {
  if (!filter) return true;
  for (const [key, value] of Object.entries(filter)) {
    if (isInternalKey(key)) continue;
    const actual = document[key];
    // Equality on top-level fields; a null filter also matches a missing field, as in MongoDB.
    if (value === null) {
      if (actual !== null && actual !== undefined) return false;
    } else if (actual !== value) {
      return false;
    }
  }
  return true;
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^\d+$/.test(text)) throw new Error('Invalid cursor');
  return Number(text);
}

/** Page through an ordered list of documents the way every backend does. */
export function pageDocuments(all: StorageDocument[], query: StorageQuery = {}): StoragePage {
  const filtered = all.filter((doc) => matches(doc, query.filter));
  const limit = Math.min(query.limit ?? STORAGE_DEFAULT_LIMIT, STORAGE_MAX_LIMIT);
  const offset = decodeCursor(query.cursor);
  const documents = filtered.slice(offset, offset + limit).map((doc) => ({ ...doc }));
  const page: StoragePage = { documents };
  if (offset + limit < filtered.length) page.nextCursor = encodeCursor(offset + limit);
  return page;
}

/** Storage kept in process memory; the Station's standalone/dev backend. */
export class InMemoryDocumentStore implements DocumentStore {
  /** installationId → collection → documentId → document (insertion ordered). */
  protected readonly data = new Map<string, Map<string, Map<string, StorageDocument>>>();

  protected collectionOf(installationId: string, collection: string): Map<string, StorageDocument> {
    let collections = this.data.get(installationId);
    if (!collections) {
      collections = new Map();
      this.data.set(installationId, collections);
    }
    let documents = collections.get(collection);
    if (!documents) {
      documents = new Map();
      collections.set(collection, documents);
    }
    return documents;
  }

  /** Hook for persistent subclasses: called after a collection changed. */
  protected async persist(_installationId: string, _collection: string): Promise<void> {}

  /** Hook for persistent subclasses: called before a collection is read. */
  protected async hydrate(_installationId: string, _collection: string): Promise<void> {}

  async put(
    installationId: string,
    collection: string,
    documentId: string,
    document: StorageDocument,
  ): Promise<void> {
    await this.hydrate(installationId, collection);
    this.collectionOf(installationId, collection).set(documentId, stripInternal(document));
    await this.persist(installationId, collection);
  }

  async get(
    installationId: string,
    collection: string,
    documentId: string,
  ): Promise<StorageDocument | null> {
    await this.hydrate(installationId, collection);
    const document = this.collectionOf(installationId, collection).get(documentId);
    return document ? { ...document } : null;
  }

  async query(
    installationId: string,
    collection: string,
    query: StorageQuery = {},
  ): Promise<StoragePage> {
    await this.hydrate(installationId, collection);
    return pageDocuments([...this.collectionOf(installationId, collection).values()], query);
  }

  async update(
    installationId: string,
    collection: string,
    documentId: string,
    patch: StorageDocument,
  ): Promise<StorageDocument | null> {
    await this.hydrate(installationId, collection);
    const documents = this.collectionOf(installationId, collection);
    const current = documents.get(documentId);
    if (!current) return null;
    const updated = { ...current, ...stripInternal(patch) };
    documents.set(documentId, updated);
    await this.persist(installationId, collection);
    return { ...updated };
  }

  async delete(installationId: string, collection: string, documentId: string): Promise<boolean> {
    await this.hydrate(installationId, collection);
    this.collectionOf(installationId, collection).delete(documentId);
    await this.persist(installationId, collection);
    return true;
  }
}

/** Collection names become file names through base64url, so any name is safe on disk. */
function collectionFileName(collection: string): string {
  return `${Buffer.from(collection, 'utf8').toString('base64url')}.json`;
}

/**
 * Storage persisted on disk: `{baseDir}/{installationId}/{collection}.json`,
 * one JSON object per collection keyed by documentId. Written on every change;
 * sized for a single user's local installations, not for a server.
 */
export class FileDocumentStore extends InMemoryDocumentStore {
  private readonly loaded = new Set<string>();

  constructor(private readonly baseDir: string) {
    super();
  }

  private filePath(installationId: string, collection: string): string {
    return resolve(this.baseDir, installationId, collectionFileName(collection));
  }

  protected override async hydrate(installationId: string, collection: string): Promise<void> {
    const key = `${installationId}\u0000${collection}`;
    if (this.loaded.has(key)) return;
    this.loaded.add(key);
    const path = this.filePath(installationId, collection);
    if (!existsSync(path)) return;
    const documents = this.collectionOf(installationId, collection);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, StorageDocument>;
    for (const [documentId, document] of Object.entries(raw)) documents.set(documentId, document);
  }

  protected override async persist(installationId: string, collection: string): Promise<void> {
    const path = this.filePath(installationId, collection);
    mkdirSync(dirname(path), { recursive: true });
    const documents = this.collectionOf(installationId, collection);
    writeFileSync(path, `${JSON.stringify(Object.fromEntries(documents), null, 2)}\n`, 'utf8');
  }
}

/**
 * Answer one Storage request with a backend. Returns the response type and
 * its fields (without the envelope), shaped as the Teros backend shapes them.
 */
export async function handleStorageRequest(
  store: DocumentStore,
  installationId: string,
  msg: Record<string, unknown>,
): Promise<{ type: string; fields: Record<string, unknown> }> {
  const collection = msg.collection as string;
  const documentId = msg.documentId as string;
  switch (msg.type) {
    case 'storage_put':
      await store.put(installationId, collection, documentId, msg.document as StorageDocument);
      return { type: 'storage_put_response', fields: { success: true, documentId } };
    case 'storage_get': {
      const document = await store.get(installationId, collection, documentId);
      return { type: 'storage_get_response', fields: { success: true, document } };
    }
    case 'storage_query': {
      try {
        const page = await store.query(installationId, collection, {
          filter: msg.filter as Record<string, unknown> | undefined,
          limit: msg.limit as number | undefined,
          cursor: msg.cursor as string | undefined,
        });
        return { type: 'storage_query_response', fields: { success: true, ...page } };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { type: 'storage_query_response', fields: { success: false, documents: [], error } };
      }
    }
    case 'storage_update': {
      const document = await store.update(
        installationId,
        collection,
        documentId,
        msg.patch as StorageDocument,
      );
      return document
        ? { type: 'storage_update_response', fields: { success: true, document } }
        : {
            type: 'storage_update_response',
            fields: { success: false, document: null, error: 'Document not found' },
          };
    }
    case 'storage_delete':
      await store.delete(installationId, collection, documentId);
      return { type: 'storage_delete_response', fields: { success: true } };
    default:
      throw new Error(`Unknown storage request: ${String(msg.type)}`);
  }
}
