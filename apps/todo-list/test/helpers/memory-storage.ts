/**
 * Test helpers: an in-memory Storage (document store) for the todo-list
 * tests, usable as host callbacks, as protocol message replies, and as a
 * `DocumentStorage` handed straight to TodoStore.
 */

import type { RequestHandlers } from '@agentapps/host';
import { createEnvelope, type MessageBase, type Transport } from '@agentapps/protocol';
import type { DocumentStorage, StorageDocument } from '@agentapps/sdk';

type Collection = Map<string, StorageDocument>;

export class MemoryStorage {
  private readonly data = new Map<string, Map<string, Collection>>();

  clear(): void {
    this.data.clear();
  }

  collection(installationId: string, name: string): Collection {
    let collections = this.data.get(installationId);
    if (!collections) {
      collections = new Map();
      this.data.set(installationId, collections);
    }
    let collection = collections.get(name);
    if (!collection) {
      collection = new Map();
      collections.set(name, collection);
    }
    return collection;
  }

  put(installationId: string, name: string, id: string, document: StorageDocument): void {
    this.collection(installationId, name).set(id, { ...document });
  }

  get(installationId: string, name: string, id: string): StorageDocument | null {
    const doc = this.collection(installationId, name).get(id);
    return doc ? { ...doc } : null;
  }

  query(installationId: string, name: string, filter?: Record<string, unknown>): StorageDocument[] {
    return [...this.collection(installationId, name).values()]
      .filter((doc) =>
        Object.entries(filter ?? {}).every(([k, v]) =>
          v === null ? doc[k] === null || doc[k] === undefined : doc[k] === v,
        ),
      )
      .map((doc) => ({ ...doc }));
  }

  update(
    installationId: string,
    name: string,
    id: string,
    patch: StorageDocument,
  ): StorageDocument | null {
    const collection = this.collection(installationId, name);
    const current = collection.get(id);
    if (!current) return null;
    const updated = { ...current, ...patch };
    collection.set(id, updated);
    return { ...updated };
  }

  delete(installationId: string, name: string, id: string): boolean {
    this.collection(installationId, name).delete(id);
    return true;
  }

  /** Host-side callbacks over this store. */
  callbacks(): Pick<
    RequestHandlers,
    'onStoragePut' | 'onStorageGet' | 'onStorageQuery' | 'onStorageUpdate' | 'onStorageDelete'
  > {
    return {
      onStoragePut: async (_sid, inst, collection, id, document) => {
        this.put(inst, collection, id, document);
        return true;
      },
      onStorageGet: async (_sid, inst, collection, id) => this.get(inst, collection, id),
      onStorageQuery: async (_sid, inst, collection, query) => ({
        documents: this.query(inst, collection, query.filter),
      }),
      onStorageUpdate: async (_sid, inst, collection, id, patch) =>
        this.update(inst, collection, id, patch),
      onStorageDelete: async (_sid, inst, collection, id) => this.delete(inst, collection, id),
    };
  }

  /** Answer a raw `storage_*` protocol message on a transport. Returns false if not a storage message. */
  reply(msg: Record<string, unknown>, transport: Transport, installationId: string): boolean {
    const type = msg.type as string;
    if (!type.startsWith('storage_')) return false;
    const requestId = (msg.requestId as string) ?? (msg.id as string);
    const sessionId = msg.sessionId as string;
    const collection = msg.collection as string;
    const id = msg.documentId as string;
    let fields: Record<string, unknown>;
    switch (type) {
      case 'storage_put':
        this.put(installationId, collection, id, msg.document as StorageDocument);
        fields = { success: true, documentId: id };
        break;
      case 'storage_get':
        fields = { success: true, document: this.get(installationId, collection, id) };
        break;
      case 'storage_query':
        fields = {
          success: true,
          documents: this.query(installationId, collection, msg.filter as Record<string, unknown>),
        };
        break;
      case 'storage_update': {
        const document = this.update(installationId, collection, id, msg.patch as StorageDocument);
        fields = document
          ? { success: true, document }
          : { success: false, document: null, error: 'Document not found' };
        break;
      }
      case 'storage_delete':
        this.delete(installationId, collection, id);
        fields = { success: true };
        break;
      default:
        return false;
    }
    transport.send({
      ...createEnvelope(`${type}_response`),
      sessionId,
      requestId,
      ...fields,
    } as MessageBase);
    return true;
  }

  /** A `DocumentStorage` bound to one installation, for calling TodoStore directly. */
  asDocumentStorage(installationId = 'test-install'): DocumentStorage {
    const collection = (name: string) => ({
      put: async (id: string, document: StorageDocument) => {
        this.put(installationId, name, id, document);
      },
      get: async (id: string) => this.get(installationId, name, id),
      query: async (options?: { filter?: Record<string, unknown> }) => ({
        documents: this.query(installationId, name, options?.filter),
      }),
      update: async (id: string, patch: StorageDocument) =>
        this.update(installationId, name, id, patch),
      delete: async (id: string) => this.delete(installationId, name, id),
    });
    const kv = collection('kv');
    return {
      collection,
      kv: {
        get: async (key) => (await kv.get(key))?.value ?? null,
        set: async (key, value) => {
          await kv.put(key, { key, value });
        },
        delete: async (key) => kv.delete(key),
        list: async (prefix) =>
          (await kv.query()).documents
            .map((d) => d.key as string)
            .filter((k) => !prefix || k.startsWith(prefix))
            .sort(),
      },
    };
  }
}
