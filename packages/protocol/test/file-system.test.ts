/**
 * Tests for the file-system protocol schemas.
 *
 * Validates that all Volume message schemas
 * parse correctly with valid data and reject invalid data.
 */

import { describe, expect, it } from 'vitest';
import {
  DirEntrySchema,
  FileErrorCode,
  FileRequestSchema,
  FileResponseSchema,
  FileStatSchema,
  FileVolumeDeleteRequestSchema,
  FileVolumeDeleteResultSchema,
  FileVolumeReadDirRequestSchema,
  FileVolumeReadDirResultSchema,
  FileVolumeReadFileRequestSchema,
  FileVolumeReadFileResultSchema,
  FileVolumeStatRequestSchema,
  FileVolumeStatResultSchema,
  FileVolumeWriteFileRequestSchema,
  FileVolumeWriteFileResultSchema,
  isFileCallbackRequest,
  isFileCallbackResponse,
  isFileCallbackResult,
  isVolumeStorageRequest,
} from '../src/index.js';

// Helper: create a valid session envelope base
function base(sessionId = 'sess_test') {
  return {
    id: 'msg_001',
    timestamp: new Date().toISOString(),
    version: '2.0' as const,
    sessionId,
  };
}

// ---------------------------------------------------------------------------
// Volume Storage — readDir
// ---------------------------------------------------------------------------

describe('DirEntrySchema', () => {
  it('parses a file entry', () => {
    const entry = DirEntrySchema.parse({
      name: 'app.log',
      type: 'file',
      size: 1024,
      modifiedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(entry.type).toBe('file');
    expect(entry.size).toBe(1024);
  });

  it('parses a directory entry', () => {
    const entry = DirEntrySchema.parse({
      name: 'subdir',
      type: 'directory',
      size: 0,
      modifiedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(entry.type).toBe('directory');
  });
});

describe('FileVolumeReadDirRequest', () => {
  it('parses a valid readDir request', () => {
    const msg = FileVolumeReadDirRequestSchema.parse({
      ...base(),
      type: 'file_volume_read_dir',
      requestId: 'cb_6',
      path: 'logs/',
    });
    expect(msg.type).toBe('file_volume_read_dir');
    expect(msg.path).toBe('logs/');
  });
});

describe('FileVolumeReadDirResult', () => {
  it('parses a successful result with entries', () => {
    const result = FileVolumeReadDirResultSchema.parse({
      ...base(),
      type: 'file_volume_read_dir_result',
      requestId: 'cb_6',
      success: true,
      entries: [
        { name: 'a.log', type: 'file', size: 100, modifiedAt: '2026-01-01T00:00:00.000Z' },
        { name: 'sub', type: 'directory', size: 0, modifiedAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    expect(result.entries).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Volume Storage — readFile / writeFile
// ---------------------------------------------------------------------------

describe('FileVolumeReadFileRequest', () => {
  it('parses a valid readFile request', () => {
    const msg = FileVolumeReadFileRequestSchema.parse({
      ...base(),
      type: 'file_volume_read_file',
      requestId: 'cb_7',
      path: 'logs/app.log',
    });
    expect(msg.path).toBe('logs/app.log');
  });
});

describe('FileVolumeReadFileResult', () => {
  it('parses a successful result with data', () => {
    const result = FileVolumeReadFileResultSchema.parse({
      ...base(),
      type: 'file_volume_read_file_result',
      requestId: 'cb_7',
      success: true,
      data: 'SGVsbG8=',
    });
    expect(result.data).toBe('SGVsbG8=');
  });
});

describe('FileVolumeWriteFileRequest', () => {
  it('parses a valid writeFile request', () => {
    const msg = FileVolumeWriteFileRequestSchema.parse({
      ...base(),
      type: 'file_volume_write_file',
      requestId: 'cb_8',
      path: 'logs/today.log',
      data: 'SGVsbG8=',
    });
    expect(msg.type).toBe('file_volume_write_file');
  });
});

describe('FileVolumeWriteFileResult', () => {
  it('parses a successful result', () => {
    const result = FileVolumeWriteFileResultSchema.parse({
      ...base(),
      type: 'file_volume_write_file_result',
      requestId: 'cb_8',
      success: true,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Volume Storage — delete / stat
// ---------------------------------------------------------------------------

describe('FileVolumeDeleteRequest', () => {
  it('parses a delete request with recursive option', () => {
    const msg = FileVolumeDeleteRequestSchema.parse({
      ...base(),
      type: 'file_volume_delete',
      requestId: 'cb_9',
      path: 'logs/archive/',
      recursive: true,
    });
    expect(msg.recursive).toBe(true);
  });

  it('parses a delete request without recursive', () => {
    const msg = FileVolumeDeleteRequestSchema.parse({
      ...base(),
      type: 'file_volume_delete',
      requestId: 'cb_9',
      path: 'logs/old.log',
    });
    expect(msg.recursive).toBeUndefined();
  });
});

describe('FileVolumeStatRequest', () => {
  it('parses a valid stat request', () => {
    const msg = FileVolumeStatRequestSchema.parse({
      ...base(),
      type: 'file_volume_stat',
      requestId: 'cb_10',
      path: 'logs/app.log',
    });
    expect(msg.type).toBe('file_volume_stat');
  });
});

describe('FileStatSchema', () => {
  it('parses a valid file stat', () => {
    const stat = FileStatSchema.parse({
      path: 'logs/app.log',
      type: 'file',
      size: 2048,
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(stat.size).toBe(2048);
    expect(stat.type).toBe('file');
  });
});

describe('FileVolumeStatResult', () => {
  it('parses a successful result with stat', () => {
    const result = FileVolumeStatResultSchema.parse({
      ...base(),
      type: 'file_volume_stat_result',
      requestId: 'cb_10',
      success: true,
      stat: {
        path: 'logs/app.log',
        type: 'file',
        size: 2048,
        createdAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-02T00:00:00.000Z',
      },
    });
    expect(result.stat?.path).toBe('logs/app.log');
  });
});

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

describe('FileRequestSchema (union)', () => {
  it('parses a volume readDir request', () => {
    const msg = FileRequestSchema.parse({
      ...base(),
      type: 'file_volume_read_dir',
      requestId: 'cb_6',
      path: 'logs/',
    });
    expect(msg.type).toBe('file_volume_read_dir');
  });

  it('rejects unknown message types', () => {
    expect(() =>
      FileRequestSchema.parse({
        ...base(),
        type: 'file_unknown',
        requestId: 'cb_x',
      }),
    ).toThrow();
  });

  it('rejects removed file_object_put type', () => {
    expect(() =>
      FileRequestSchema.parse({
        ...base(),
        type: 'file_object_put',
        requestId: 'cb_1',
        key: 'file.txt',
        data: 'SGVsbG8=',
      }),
    ).toThrow();
  });
});

describe('FileResponseSchema (union)', () => {
  it('parses a volume stat result', () => {
    const msg = FileResponseSchema.parse({
      ...base(),
      type: 'file_volume_stat_result',
      requestId: 'cb_10',
      success: false,
      error: 'FILE_NOT_FOUND',
    });
    expect(msg.type).toBe('file_volume_stat_result');
  });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe('Type guards', () => {
  it('isVolumeStorageRequest identifies volume requests', () => {
    expect(isVolumeStorageRequest({ type: 'file_volume_read_dir' })).toBe(true);
    expect(isVolumeStorageRequest({ type: 'file_volume_stat' })).toBe(true);
    expect(isVolumeStorageRequest({ type: 'file_volume_stat_result' })).toBe(false);
    expect(isVolumeStorageRequest({ type: 'object_put' })).toBe(false);
    expect(isVolumeStorageRequest({})).toBe(false);
  });

  it('isFileCallbackResult identifies any *_result type', () => {
    expect(isFileCallbackResult({ type: 'file_volume_stat_result' })).toBe(true);
    expect(isFileCallbackResult({ type: 'file_volume_read_file_result' })).toBe(true);
    expect(isFileCallbackResult({ type: 'file_volume_stat' })).toBe(false);
    expect(isFileCallbackResult({ type: 'object_put_result' })).toBe(false);
    expect(isFileCallbackResult({})).toBe(false);
  });

  it('isFileCallbackRequest validates a full message', () => {
    expect(
      isFileCallbackRequest({
        ...base(),
        type: 'file_volume_read_dir',
        requestId: 'cb_6',
        path: 'logs/',
      }),
    ).toBe(true);

    expect(
      isFileCallbackRequest({
        ...base(),
        type: 'unknown_type',
        requestId: 'cb_1',
      }),
    ).toBe(false);
  });

  it('isFileCallbackResponse validates a full response', () => {
    expect(
      isFileCallbackResponse({
        ...base(),
        type: 'file_volume_write_file_result',
        requestId: 'cb_11',
        success: true,
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

describe('FileErrorCode', () => {
  it('exports all expected error codes', () => {
    expect(FileErrorCode.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
    expect(FileErrorCode.INVALID_PATH).toBe('INVALID_PATH');
    expect(FileErrorCode.FILE_TOO_LARGE).toBe('FILE_TOO_LARGE');
    expect(FileErrorCode.QUOTA_EXCEEDED).toBe('QUOTA_EXCEEDED');
    expect(FileErrorCode.VOLUME_NOT_MOUNTED).toBe('VOLUME_NOT_MOUNTED');
    expect(FileErrorCode.PATH_TRAVERSAL_BLOCKED).toBe('PATH_TRAVERSAL_BLOCKED');
    expect(FileErrorCode.STORAGE_OPERATION_UNSUPPORTED).toBe('STORAGE_OPERATION_UNSUPPORTED');
  });

  it('no longer exports OBJECT_STORAGE_DISABLED', () => {
    expect(FileErrorCode).not.toHaveProperty('OBJECT_STORAGE_DISABLED');
  });
});
