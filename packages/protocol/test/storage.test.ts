/**
 * Tests for the Storage request schemas: the document store private to an
 * Installation (storage_put / get / query / update / delete).
 *
 * The wire shapes match the Teros backend field for field; the fixtures in
 * the last block copy Teros's `types.ts` request and response interfaces.
 */

import { describe, expect, it } from 'vitest';
import {
  createEnvelope,
  InstanceRequestResponseSchema,
  InstanceRequestSchema,
  isStorageCallbackRequest,
  isStorageCallbackResponse,
  PROTOCOL_VERSION,
  STORAGE_REQUEST_TYPES,
  StorageDeleteRequestSchema,
  StorageDeleteResultSchema,
  StorageGetRequestSchema,
  StorageGetResultSchema,
  StoragePutRequestSchema,
  StoragePutResultSchema,
  StorageQueryRequestSchema,
  StorageQueryResultSchema,
  StorageUpdateRequestSchema,
  StorageUpdateResultSchema,
} from '../src/index.js';

const SESSION_ID = 'sess_storage_001';

function base(type: string) {
  return {
    ...createEnvelope(type, SESSION_ID),
    type,
    sessionId: SESSION_ID,
    version: PROTOCOL_VERSION,
  };
}

describe('storage_put', () => {
  it('validates a put request', () => {
    const msg = {
      ...base('storage_put'),
      requestId: 'req_put_1',
      collection: 'nodes',
      documentId: 'n1',
      document: { text: 'Buy milk', completed: false },
    };
    expect(StoragePutRequestSchema.safeParse(msg).success).toBe(true);
    expect(InstanceRequestSchema.parse(msg).type).toBe('storage_put');
  });

  it('rejects a put without collection, documentId or document', () => {
    const full = {
      ...base('storage_put'),
      requestId: 'r',
      collection: 'nodes',
      documentId: 'n1',
      document: {},
    };
    for (const missing of ['collection', 'documentId', 'document']) {
      const { [missing]: _omitted, ...msg } = full as Record<string, unknown>;
      expect(StoragePutRequestSchema.safeParse(msg).success, missing).toBe(false);
    }
  });

  it('validates put results with and without error', () => {
    expect(
      StoragePutResultSchema.safeParse({
        ...base('storage_put_response'),
        requestId: 'r',
        success: true,
        documentId: 'n1',
      }).success,
    ).toBe(true);
    expect(
      StoragePutResultSchema.safeParse({
        ...base('storage_put_response'),
        requestId: 'r',
        success: false,
        error: 'Document too large',
      }).success,
    ).toBe(true);
  });
});

describe('storage_get', () => {
  it('validates a get request and both result shapes', () => {
    expect(
      StorageGetRequestSchema.safeParse({
        ...base('storage_get'),
        requestId: 'r',
        collection: 'nodes',
        documentId: 'n1',
      }).success,
    ).toBe(true);
    expect(
      StorageGetResultSchema.safeParse({
        ...base('storage_get_response'),
        requestId: 'r',
        success: true,
        document: { text: 'Buy milk' },
      }).success,
    ).toBe(true);
    expect(
      StorageGetResultSchema.safeParse({
        ...base('storage_get_response'),
        requestId: 'r',
        success: true,
        document: null,
      }).success,
    ).toBe(true);
  });

  it('rejects the old key-based get', () => {
    expect(
      StorageGetRequestSchema.safeParse({ ...base('storage_get'), requestId: 'r', key: 'x' })
        .success,
    ).toBe(false);
  });
});

describe('storage_query', () => {
  it('validates a query with filter, limit and cursor', () => {
    const msg = {
      ...base('storage_query'),
      requestId: 'r',
      collection: 'nodes',
      filter: { parentId: 'n1', completed: false },
      limit: 50,
      cursor: 'MTAw',
    };
    expect(StorageQueryRequestSchema.safeParse(msg).success).toBe(true);
  });

  it('validates a query with only a collection', () => {
    expect(
      StorageQueryRequestSchema.safeParse({
        ...base('storage_query'),
        requestId: 'r',
        collection: 'nodes',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-positive limit', () => {
    expect(
      StorageQueryRequestSchema.safeParse({
        ...base('storage_query'),
        requestId: 'r',
        collection: 'nodes',
        limit: 0,
      }).success,
    ).toBe(false);
  });

  it('validates a page with and without nextCursor', () => {
    expect(
      StorageQueryResultSchema.safeParse({
        ...base('storage_query_response'),
        requestId: 'r',
        success: true,
        documents: [{ text: 'a' }, { text: 'b' }],
        nextCursor: 'Mg',
      }).success,
    ).toBe(true);
    expect(
      StorageQueryResultSchema.safeParse({
        ...base('storage_query_response'),
        requestId: 'r',
        success: true,
        documents: [],
      }).success,
    ).toBe(true);
  });
});

describe('storage_update', () => {
  it('validates an update request', () => {
    expect(
      StorageUpdateRequestSchema.safeParse({
        ...base('storage_update'),
        requestId: 'r',
        collection: 'nodes',
        documentId: 'n1',
        patch: { completed: true },
      }).success,
    ).toBe(true);
  });

  it('rejects an update without patch', () => {
    expect(
      StorageUpdateRequestSchema.safeParse({
        ...base('storage_update'),
        requestId: 'r',
        collection: 'nodes',
        documentId: 'n1',
      }).success,
    ).toBe(false);
  });

  it('validates the updated document and the not-found result', () => {
    expect(
      StorageUpdateResultSchema.safeParse({
        ...base('storage_update_response'),
        requestId: 'r',
        success: true,
        document: { text: 'Buy milk', completed: true },
      }).success,
    ).toBe(true);
    expect(
      StorageUpdateResultSchema.safeParse({
        ...base('storage_update_response'),
        requestId: 'r',
        success: false,
        document: null,
        error: 'Document not found',
      }).success,
    ).toBe(true);
  });
});

describe('storage_delete', () => {
  it('validates a delete request and result', () => {
    expect(
      StorageDeleteRequestSchema.safeParse({
        ...base('storage_delete'),
        requestId: 'r',
        collection: 'nodes',
        documentId: 'n1',
      }).success,
    ).toBe(true);
    expect(
      StorageDeleteResultSchema.safeParse({
        ...base('storage_delete_response'),
        requestId: 'r',
        success: true,
      }).success,
    ).toBe(true);
    expect(
      InstanceRequestResponseSchema.parse({
        ...base('storage_delete_response'),
        requestId: 'r',
        success: true,
      }).type,
    ).toBe('storage_delete_response');
  });
});

describe('the key-value family is gone', () => {
  it('storage_set and storage_list are not request requests', () => {
    for (const type of ['storage_set', 'storage_list']) {
      const msg = { ...base(type), requestId: 'r', key: 'k', value: 1 };
      expect(InstanceRequestSchema.safeParse(msg).success, type).toBe(false);
    }
  });

  it('STORAGE_REQUEST_TYPES lists exactly the five requests', () => {
    expect([...STORAGE_REQUEST_TYPES].sort()).toEqual([
      'storage_delete',
      'storage_get',
      'storage_put',
      'storage_query',
      'storage_update',
    ]);
  });
});

describe('type guards', () => {
  it('recognise every request and response', () => {
    const requests = [
      { ...base('storage_put'), requestId: 'r', collection: 'c', documentId: 'd', document: {} },
      { ...base('storage_get'), requestId: 'r', collection: 'c', documentId: 'd' },
      { ...base('storage_query'), requestId: 'r', collection: 'c' },
      { ...base('storage_update'), requestId: 'r', collection: 'c', documentId: 'd', patch: {} },
      { ...base('storage_delete'), requestId: 'r', collection: 'c', documentId: 'd' },
    ];
    for (const msg of requests) expect(isStorageCallbackRequest(msg), msg.type).toBe(true);
    const responses = [
      { ...base('storage_put_response'), requestId: 'r', success: true },
      { ...base('storage_get_response'), requestId: 'r', success: true, document: null },
      { ...base('storage_query_response'), requestId: 'r', success: true, documents: [] },
      { ...base('storage_update_response'), requestId: 'r', success: true, document: {} },
      { ...base('storage_delete_response'), requestId: 'r', success: true },
    ];
    for (const msg of responses) expect(isStorageCallbackResponse(msg), msg.type).toBe(true);
    expect(isStorageCallbackRequest({ ...base('object_get'), requestId: 'r', objectId: 'o' })).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Teros compatibility: payloads shaped exactly like the Teros backend's
// StoragePutRequest, StorageGetRequest, StorageQueryRequest,
// StorageUpdateRequest, StorageDeleteRequest and their responses
// (teros/packages/backend/src/services/agent-apps/types.ts). Teros adds
// `installationId` on requests; our schemas strip unknown keys, so it passes.
// ---------------------------------------------------------------------------

describe('Teros-shaped payloads', () => {
  const installationId = 'inst_teros';

  it('accepts the five Teros request shapes', () => {
    const teros = [
      {
        type: 'storage_put',
        installationId,
        collection: 'notes',
        documentId: 'doc_1',
        document: { title: 'Hello' },
      },
      { type: 'storage_get', installationId, collection: 'notes', documentId: 'doc_1' },
      {
        type: 'storage_query',
        installationId,
        collection: 'notes',
        filter: { title: 'Hello' },
        limit: 10,
        cursor: 'NjRiYXNl',
      },
      {
        type: 'storage_update',
        installationId,
        collection: 'notes',
        documentId: 'doc_1',
        patch: { title: 'Hola' },
      },
      { type: 'storage_delete', installationId, collection: 'notes', documentId: 'doc_1' },
    ];
    for (const req of teros) {
      const parsed = InstanceRequestSchema.safeParse({
        ...base(req.type),
        requestId: 'r',
        ...req,
      });
      expect(parsed.success, req.type).toBe(true);
    }
  });

  it('accepts the five Teros response shapes', () => {
    const teros: Array<[string, Record<string, unknown>]> = [
      ['storage_put_response', { success: true, documentId: 'doc_1' }],
      ['storage_get_response', { success: true, document: { title: 'Hello' } }],
      [
        'storage_query_response',
        { success: true, documents: [{ title: 'Hello' }], nextCursor: 'abc' },
      ],
      ['storage_query_response', { success: false, documents: [], error: 'Invalid cursor' }],
      ['storage_update_response', { success: false, document: null, error: 'Document not found' }],
      ['storage_delete_response', { success: true }],
    ];
    for (const [type, fields] of teros) {
      const parsed = InstanceRequestResponseSchema.safeParse({
        ...base(type),
        requestId: 'r',
        ...fields,
      });
      expect(parsed.success, type).toBe(true);
    }
  });
});
