/**
 * Agent Apps Protocol v2.0 — file system.
 *
 * The Volume: the Workspace's shared file area, accessed in API mode through
 * filesystem-level operations (readDir/readFile/writeFile/delete/stat/mkdir).
 * Think POSIX: paths, directories, file stats. Objects (immutable blobs with
 * a URL) are a separate family in session-plane.ts.
 *
 * The host owns the physical storage. The instance requests operations via
 * requests (instance → host, proxied by the app station — same pattern as
 * secrets and auth). The app station MUST NOT read or persist file payloads.
 *
 * @spec VOL-REQ-3 (API mode requests), VOL-REQ-2 (permission errors)
 */

import { z } from 'zod';
import { PermissionDeniedDetailsSchema } from './errors.js';
import { SessionMessageBaseSchema } from './session-plane.js';

// ---------------------------------------------------------------------------
// Error codes (file-system specific)
// ---------------------------------------------------------------------------

export const FileErrorCode = {
  /** File not found at the given path. */
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  /** Path is invalid (malformed, empty, or violates naming rules). */
  INVALID_PATH: 'INVALID_PATH',
  /** File exceeds the maximum allowed size. */
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  /** Quota exceeded for this installation. */
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  /** Volume storage is not configured for this installation. */
  VOLUME_NOT_MOUNTED: 'VOLUME_NOT_MOUNTED',
  /** Path traversal attempt detected (e.g. `../` outside the volume root). */
  PATH_TRAVERSAL_BLOCKED: 'PATH_TRAVERSAL_BLOCKED',
  /** The operation is not supported by the host's storage backend. */
  STORAGE_OPERATION_UNSUPPORTED: 'STORAGE_OPERATION_UNSUPPORTED',
} as const;

export type FileErrorCode = (typeof FileErrorCode)[keyof typeof FileErrorCode];

// ===========================================================================
// VOLUME STORAGE (instance → host request)
// ===========================================================================

/** Directory entry — a file or subdirectory inside a volume. */
export const DirEntrySchema = z.object({
  /** Entry name (no path, just the final segment). */
  name: z.string(),
  /** `"file"` or `"directory"`. */
  type: z.enum(['file', 'directory']),
  /** Size in bytes (0 for directories). */
  size: z.number().int().nonnegative().default(0),
  /** ISO 8601 last-modified timestamp. */
  modifiedAt: z.string(),
});
export type DirEntry = z.infer<typeof DirEntrySchema>;

/** File stat — detailed metadata for a single path. */
export const FileStatSchema = z.object({
  /** Full path relative to the volume root. */
  path: z.string(),
  /** `"file"` or `"directory"`. */
  type: z.enum(['file', 'directory']),
  /** Size in bytes (0 for directories). */
  size: z.number().int().nonnegative().default(0),
  /** ISO 8601 creation timestamp. */
  createdAt: z.string(),
  /** ISO 8601 last-modified timestamp. */
  modifiedAt: z.string(),
});
export type FileStat = z.infer<typeof FileStatSchema>;

/**
 * Error fields shared by every `file_volume_*` result.
 * `code` is `INVALID_ARGUMENTS` for a rejected path (VOL-REQ-3) and
 * `PERMISSION_DENIED` without the `volume` Permission (VOL-REQ-2), in which
 * case `details` names the layer and the Permission.
 */
const VolumeErrorFields = {
  error: z.string().optional(),
  code: z.string().optional(),
  details: PermissionDeniedDetailsSchema.optional(),
};

// --- readDir ---------------------------------------------------------------

export const FileVolumeReadDirRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('file_volume_read_dir'),
  requestId: z.string(),
  /** Directory path relative to the volume root (no leading slash). */
  path: z.string(),
});
export type FileVolumeReadDirRequest = z.infer<typeof FileVolumeReadDirRequestSchema>;

export const FileVolumeReadDirResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('file_volume_read_dir_result'),
  requestId: z.string(),
  success: z.boolean(),
  entries: z.array(DirEntrySchema).default([]),
  ...VolumeErrorFields,
});
export type FileVolumeReadDirResult = z.infer<typeof FileVolumeReadDirResultSchema>;

// --- readFile --------------------------------------------------------------

export const FileVolumeReadFileRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('file_volume_read_file'),
  requestId: z.string(),
  /** File path relative to the volume root (no leading slash). */
  path: z.string(),
});
export type FileVolumeReadFileRequest = z.infer<typeof FileVolumeReadFileRequestSchema>;

export const FileVolumeReadFileResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('file_volume_read_file_result'),
  requestId: z.string(),
  success: z.boolean(),
  /** File content as a base64-encoded string. */
  data: z.string().optional(),
  ...VolumeErrorFields,
});
export type FileVolumeReadFileResult = z.infer<typeof FileVolumeReadFileResultSchema>;

// --- writeFile -------------------------------------------------------------

export const FileVolumeWriteFileRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('file_volume_write_file'),
  requestId: z.string(),
  /** File path relative to the volume root (no leading slash). */
  path: z.string(),
  /** File content as a base64-encoded string. */
  data: z.string(),
});
export type FileVolumeWriteFileRequest = z.infer<typeof FileVolumeWriteFileRequestSchema>;

export const FileVolumeWriteFileResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('file_volume_write_file_result'),
  requestId: z.string(),
  success: z.boolean(),
  ...VolumeErrorFields,
});
export type FileVolumeWriteFileResult = z.infer<typeof FileVolumeWriteFileResultSchema>;

// --- delete ----------------------------------------------------------------

export const FileVolumeDeleteRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('file_volume_delete'),
  requestId: z.string(),
  /** Path relative to the volume root (no leading slash). */
  path: z.string(),
  /** If `true`, delete recursively (for directories). Default: false. */
  recursive: z.boolean().optional(),
});
export type FileVolumeDeleteRequest = z.infer<typeof FileVolumeDeleteRequestSchema>;

export const FileVolumeDeleteResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('file_volume_delete_result'),
  requestId: z.string(),
  success: z.boolean(),
  ...VolumeErrorFields,
});
export type FileVolumeDeleteResult = z.infer<typeof FileVolumeDeleteResultSchema>;

// --- stat ------------------------------------------------------------------

export const FileVolumeStatRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('file_volume_stat'),
  requestId: z.string(),
  /** Path relative to the volume root (no leading slash). */
  path: z.string(),
});
export type FileVolumeStatRequest = z.infer<typeof FileVolumeStatRequestSchema>;

export const FileVolumeStatResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('file_volume_stat_result'),
  requestId: z.string(),
  success: z.boolean(),
  stat: FileStatSchema.optional(),
  ...VolumeErrorFields,
});
export type FileVolumeStatResult = z.infer<typeof FileVolumeStatResultSchema>;

// --- mkdir -----------------------------------------------------------------

/** Create a directory and any missing parents (VOL-REQ-3). */
export const FileVolumeMkdirRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('file_volume_mkdir'),
  requestId: z.string(),
  /** Directory path relative to the volume root (no leading slash). */
  path: z.string(),
});
export type FileVolumeMkdirRequest = z.infer<typeof FileVolumeMkdirRequestSchema>;

export const FileVolumeMkdirResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('file_volume_mkdir_result'),
  requestId: z.string(),
  success: z.boolean(),
  ...VolumeErrorFields,
});
export type FileVolumeMkdirResult = z.infer<typeof FileVolumeMkdirResultSchema>;

// ===========================================================================
// UNION TYPES
// ===========================================================================

/** Union of all file-system request requests (instance → host via app station). */
export const FileRequestSchema = z.discriminatedUnion('type', [
  FileVolumeReadDirRequestSchema,
  FileVolumeReadFileRequestSchema,
  FileVolumeWriteFileRequestSchema,
  FileVolumeDeleteRequestSchema,
  FileVolumeStatRequestSchema,
  FileVolumeMkdirRequestSchema,
]);
export type FileRequest = z.infer<typeof FileRequestSchema>;

/** Union of all file-system request responses (host → instance via app station). */
export const FileResponseSchema = z.discriminatedUnion('type', [
  FileVolumeReadDirResultSchema,
  FileVolumeReadFileResultSchema,
  FileVolumeWriteFileResultSchema,
  FileVolumeDeleteResultSchema,
  FileVolumeStatResultSchema,
  FileVolumeMkdirResultSchema,
]);
export type FileResponse = z.infer<typeof FileResponseSchema>;

// ===========================================================================
// TYPE GUARDS
// ===========================================================================

/** Is this a file-system request request (instance → host)? */
export function isFileCallbackRequest(data: unknown): data is FileRequest {
  return FileRequestSchema.safeParse(data).success;
}

/** Is this a file-system request response (host → instance)? */
export function isFileCallbackResponse(data: unknown): data is FileResponse {
  return FileResponseSchema.safeParse(data).success;
}

/** Is this a volume-storage request request? */
export function isVolumeStorageRequest(data: unknown): boolean {
  const t = (data as Record<string, unknown>)?.type;
  return typeof t === 'string' && t.startsWith('file_volume_') && !t.endsWith('_result');
}

/** Is this a file-system request result (any `*_result` type)? */
export function isFileCallbackResult(data: unknown): boolean {
  const t = (data as Record<string, unknown>)?.type;
  if (typeof t !== 'string') return false;
  return t.startsWith('file_volume_') && t.endsWith('_result');
}
