/**
 * Workspace Volume handlers for the Agent Apps Station.
 *
 * One Volume per Workspace (VOL-REQ-1), rooted at
 *
 *   {VOLUMES_BASE_PATH}/ws_{workspaceId}/workspace/
 *
 * API mode answers the `file_volume_*` Requests (VOL-REQ-3) for Installations
 * holding the `volume` Permission (VOL-REQ-2). Mount mode hands the same
 * directory to the Instance (VOL-REQ-5), so both modes see the same files
 * (VOL-REQ-6). All paths are relative to the root and never escape it
 * (VOL-NFR-1).
 */

import { mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { type DirEntry, ErrorCode, FileErrorCode, type FileStat } from '@agentapps/protocol';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Default base path for volume storage (under the user's home directory). */
const DEFAULT_VOLUMES_BASE_PATH = join(homedir(), '.agentapps', 'data');

/**
 * Resolve the volumes base path from the environment or fall back to the
 * default. Callers can also pass an explicit override.
 *
 * @spec VOL-REQ-1
 */
export function getVolumesBasePath(override?: string): string {
  if (override) return resolve(override);
  const env = process.env.AGENTAPPS_VOLUMES_BASE_PATH;
  if (env) return resolve(env);
  return resolve(DEFAULT_VOLUMES_BASE_PATH);
}

// ---------------------------------------------------------------------------
// Path resolution & security
// ---------------------------------------------------------------------------

/**
 * Resolve a relative path (from the instance) to an absolute host path
 * inside the Workspace's Volume root.
 *
 * Rejects with `INVALID_ARGUMENTS` (VOL-REQ-3): absolute paths (leading slash
 * or backslash, or a drive letter), any literal `..` segment, and any path
 * whose resolution escapes the root.
 *
 * @spec VOL-REQ-3
 * @returns The absolute host path, or throws with code `INVALID_ARGUMENTS`.
 */
export function resolveVolumePath(volumeRoot: string, relPath: string): string {
  const root = resolve(volumeRoot);

  if (relPath.startsWith('/') || relPath.startsWith('\\') || /^[A-Za-z]:/.test(relPath)) {
    throw invalidPath('Absolute paths are not allowed; use a path relative to the Volume root');
  }

  // Reject literal '..' segments (allow names like '..foo' or 'foo..bar')
  const segments = relPath.split(/[\\/]/);
  if (segments.includes('..')) {
    throw invalidPath('Path traversal detected: ".." segment in path');
  }

  // Join and resolve — normalises the path
  const target = resolve(join(root, relPath));

  // Final check: the resolved path must be within the volume root.
  // The target must either be the root itself, or start with root + separator.
  // This correctly allows filenames like '..foo.txt' (which resolve to
  // root/..foo.txt) while blocking actual traversal (root/../etc → /etc).
  if (target !== root && !target.startsWith(root + sep)) {
    throw invalidPath('Path traversal detected: resolved path escapes volume root');
  }

  return target;
}

/**
 * Build the Volume root for a Workspace: one per Workspace, shared by every
 * Installation in it.
 *
 *   {volumesBasePath}/ws_{workspaceId}/workspace/
 *
 * @spec VOL-REQ-1
 */
export function buildVolumeRoot(volumesBasePath: string, workspaceId: string): string {
  return join(volumesBasePath, `ws_${workspaceId}`, 'workspace');
}

/**
 * Decide the mount path handed to an Instance in mount mode.
 *
 * Returns the absolute Volume root when the App declares
 * `runtime.mountVolume: true` AND the Installation holds the `volume`
 * Permission; `undefined` otherwise, so no mount is provided without the
 * Permission (VOL-REQ-2, VOL-REQ-4). Throws when the mount is due but the
 * Data Store cannot provide the Volume as a directory (DATASTORE-REQ-8).
 *
 * @spec VOL-REQ-5
 * @spec DATASTORE-REQ-8
 */
export function resolveMountPath(options: {
  mountVolume: boolean | undefined;
  permissions: { volume?: boolean } | undefined;
  volume: VolumeStore;
  workspaceId: string;
}): string | undefined {
  if (options.mountVolume !== true) return undefined;
  if (options.permissions?.volume !== true) return undefined;
  const path = options.volume.mountPath(options.workspaceId);
  if (path === null) {
    throw new Error(
      'Mount mode is not available: the Data Store of this Station cannot provide the Volume as a directory',
    );
  }
  return resolve(path);
}

// ---------------------------------------------------------------------------
// Handler context
// ---------------------------------------------------------------------------

/** Context passed to every volume handler. */
export interface VolumeHandlerContext {
  /** The Volume part of the Station's Data Store. */
  volume: VolumeStore;
  /** Workspace ID from the session. */
  workspaceId: string;
  /** Session ID from the request message. */
  sessionId: string;
  /** The Installation's Effective Permissions; `volume` gates every request (VOL-REQ-2). */
  permissions: { volume?: boolean } | undefined;
}

// ---------------------------------------------------------------------------
// Volume operations
// ---------------------------------------------------------------------------

/** Result wrapper — either success with data or failure with error code. */
export interface VolumeResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

/**
 * The Volume part of a Data Store: the operations of API mode, per Workspace,
 * and whether the Volume exists as a real directory for mount mode.
 *
 * Paths are relative to the Volume root. An implementation refuses absolute
 * paths, `..` segments and anything that escapes the root with
 * `INVALID_ARGUMENTS` (VOL-REQ-3).
 *
 * @spec DATASTORE-REQ-3
 */
export interface VolumeStore {
  readDir(workspaceId: string, path: string): Promise<VolumeResult<DirEntry[]>>;
  readFile(
    workspaceId: string,
    path: string,
  ): Promise<VolumeResult<{ data: string; size: number; modifiedAt: string }>>;
  writeFile(workspaceId: string, path: string, dataBase64: string): Promise<VolumeResult<void>>;
  delete(workspaceId: string, path: string, recursive: boolean): Promise<VolumeResult<void>>;
  stat(workspaceId: string, path: string): Promise<VolumeResult<FileStat>>;
  mkdir(workspaceId: string, path: string): Promise<VolumeResult<void>>;
  /**
   * The Workspace's Volume as a directory on the machine where Instances run,
   * or `null` when this store cannot provide one. The directory is the Volume
   * itself, never a copy (DATASTORE-REQ-8).
   */
  mountPath(workspaceId: string): string | null;
}

/**
 * A Volume kept in a directory: `{basePath}/ws_{workspaceId}/workspace/`.
 *
 * @spec VOL-REQ-1
 * @spec DATASTORE-REQ-7
 */
export class LocalVolumeStore implements VolumeStore {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = resolve(basePath);
  }

  mountPath(workspaceId: string): string {
    return resolve(buildVolumeRoot(this.basePath, workspaceId));
  }

  async readDir(workspaceId: string, path: string): Promise<VolumeResult<DirEntry[]>> {
    try {
      const volumeRoot = buildVolumeRoot(this.basePath, workspaceId);
      const absPath = resolveVolumePath(volumeRoot, path || '.');

      const entries = await readdir(absPath, { withFileTypes: true });
      const result: DirEntry[] = [];

      for (const entry of entries) {
        let size = 0;
        let mtime: Date;
        try {
          const s = await stat(join(absPath, entry.name));
          size = entry.isDirectory() ? 0 : s.size;
          mtime = s.mtime;
        } catch {
          // Broken symlink or race — skip
          continue;
        }
        result.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size,
          modifiedAt: mtime.toISOString(),
        });
      }

      return { success: true, data: result };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  async readFile(
    workspaceId: string,
    path: string,
  ): Promise<VolumeResult<{ data: string; size: number; modifiedAt: string }>> {
    try {
      const volumeRoot = buildVolumeRoot(this.basePath, workspaceId);
      const absPath = resolveVolumePath(volumeRoot, path);

      const s = await stat(absPath);
      if (s.isDirectory()) {
        return {
          success: false,
          error: 'Path is a directory, not a file',
          errorCode: FileErrorCode.INVALID_PATH,
        };
      }

      const buf = await readFile(absPath);
      return {
        success: true,
        data: {
          data: buf.toString('base64'),
          size: buf.length,
          modifiedAt: s.mtime.toISOString(),
        },
      };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  async writeFile(
    workspaceId: string,
    path: string,
    dataBase64: string,
  ): Promise<VolumeResult<void>> {
    try {
      const volumeRoot = buildVolumeRoot(this.basePath, workspaceId);
      const absPath = resolveVolumePath(volumeRoot, path);

      // Ensure the volume root exists
      await mkdir(volumeRoot, { recursive: true });

      // Create parent directories
      const parentDir = join(absPath, '..');
      await mkdir(parentDir, { recursive: true });

      const buf = Buffer.from(dataBase64, 'base64');
      await writeFile(absPath, buf);

      return { success: true };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  async delete(workspaceId: string, path: string, recursive: boolean): Promise<VolumeResult<void>> {
    try {
      const volumeRoot = buildVolumeRoot(this.basePath, workspaceId);
      const absPath = resolveVolumePath(volumeRoot, path);

      // Prevent deleting the volume root itself
      if (absPath === resolve(volumeRoot)) {
        return {
          success: false,
          error: 'Cannot delete the volume root',
          errorCode: FileErrorCode.INVALID_PATH,
        };
      }

      const s = await stat(absPath);

      if (s.isDirectory() && !recursive) {
        // Check if directory is empty
        const entries = await readdir(absPath);
        if (entries.length > 0) {
          return {
            success: false,
            error: 'Directory is not empty — use recursive: true to delete',
            errorCode: FileErrorCode.INVALID_PATH,
          };
        }
        // Use rmdir for empty directories (rm with recursive:false fails on dirs)
        await rmdir(absPath);
      } else {
        await rm(absPath, { recursive });
      }
      return { success: true };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  async stat(workspaceId: string, path: string): Promise<VolumeResult<FileStat>> {
    try {
      const volumeRoot = buildVolumeRoot(this.basePath, workspaceId);
      const absPath = resolveVolumePath(volumeRoot, path || '.');

      const s = await stat(absPath);
      const isDir = s.isDirectory();

      // Compute the relative path for the response
      // Use substring instead of path.relative to avoid '..' normalisation
      const rootStr = resolve(volumeRoot);
      const relPath = absPath === rootStr ? '.' : absPath.slice(rootStr.length + 1); // +1 for the separator
      // Normalise to forward slashes (container-side convention)
      const normalisedPath = relPath.split(sep).join('/') || '.';

      return {
        success: true,
        data: {
          path: normalisedPath,
          type: isDir ? 'directory' : 'file',
          size: isDir ? 0 : s.size,
          createdAt: s.birthtime.toISOString(),
          modifiedAt: s.mtime.toISOString(),
        },
      };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  async mkdir(workspaceId: string, path: string): Promise<VolumeResult<void>> {
    try {
      const volumeRoot = buildVolumeRoot(this.basePath, workspaceId);
      const absPath = resolveVolumePath(volumeRoot, path);
      await mkdir(absPath, { recursive: true });
      return { success: true };
    } catch (err) {
      return toErrorResult(err);
    }
  }
}

interface MemoryNode {
  type: 'file' | 'directory';
  data: Buffer;
  createdAt: string;
  modifiedAt: string;
}

/**
 * A Volume kept in process memory, with no directory to mount. For tests, and
 * the model of a Data Store that cannot offer mount mode.
 *
 * @spec DATASTORE-NFR-2
 */
export class InMemoryVolumeStore implements VolumeStore {
  private readonly volumes = new Map<string, Map<string, MemoryNode>>();

  mountPath(_workspaceId: string): null {
    return null;
  }

  private nodes(workspaceId: string): Map<string, MemoryNode> {
    let nodes = this.volumes.get(workspaceId);
    if (!nodes) {
      nodes = new Map();
      this.volumes.set(workspaceId, nodes);
    }
    return nodes;
  }

  /** The path as a key: validated like a real one, `''` for the root. */
  private static key(path: string): string {
    const abs = resolveVolumePath('/volume', path || '.');
    return abs === '/volume' ? '' : abs.slice('/volume/'.length).split(sep).join('/');
  }

  private static missing(path: string): VolumeResult<never> {
    return {
      success: false,
      error: `ENOENT: no such file or directory, '${path}'`,
      errorCode: FileErrorCode.FILE_NOT_FOUND,
    };
  }

  private ensureDirs(nodes: Map<string, MemoryNode>, key: string): void {
    const parts = key.split('/').filter(Boolean);
    const now = new Date().toISOString();
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!nodes.has(dir)) {
        nodes.set(dir, {
          type: 'directory',
          data: Buffer.alloc(0),
          createdAt: now,
          modifiedAt: now,
        });
      }
    }
  }

  private static children(nodes: Map<string, MemoryNode>, key: string): string[] {
    const prefix = key === '' ? '' : `${key}/`;
    return [...nodes.keys()].filter(
      (k) => k !== key && k.startsWith(prefix) && !k.slice(prefix.length).includes('/'),
    );
  }

  async readDir(workspaceId: string, path: string): Promise<VolumeResult<DirEntry[]>> {
    try {
      const nodes = this.nodes(workspaceId);
      const key = InMemoryVolumeStore.key(path);
      const dir = nodes.get(key);
      if (key !== '' && dir?.type !== 'directory') return InMemoryVolumeStore.missing(path);
      if (key === '' && nodes.size === 0) return InMemoryVolumeStore.missing(path);
      const prefix = key === '' ? '' : `${key}/`;
      return {
        success: true,
        data: InMemoryVolumeStore.children(nodes, key).map((k) => {
          const node = nodes.get(k) as MemoryNode;
          return {
            name: k.slice(prefix.length),
            type: node.type,
            size: node.type === 'directory' ? 0 : node.data.length,
            modifiedAt: node.modifiedAt,
          };
        }),
      };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  async readFile(
    workspaceId: string,
    path: string,
  ): Promise<VolumeResult<{ data: string; size: number; modifiedAt: string }>> {
    try {
      const node = this.nodes(workspaceId).get(InMemoryVolumeStore.key(path));
      if (!node) return InMemoryVolumeStore.missing(path);
      if (node.type === 'directory') {
        return {
          success: false,
          error: 'Path is a directory, not a file',
          errorCode: FileErrorCode.INVALID_PATH,
        };
      }
      return {
        success: true,
        data: {
          data: node.data.toString('base64'),
          size: node.data.length,
          modifiedAt: node.modifiedAt,
        },
      };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  async writeFile(
    workspaceId: string,
    path: string,
    dataBase64: string,
  ): Promise<VolumeResult<void>> {
    try {
      const nodes = this.nodes(workspaceId);
      const key = InMemoryVolumeStore.key(path);
      if (key === '' || nodes.get(key)?.type === 'directory') {
        return {
          success: false,
          error: 'Path is a directory, not a file',
          errorCode: FileErrorCode.INVALID_PATH,
        };
      }
      this.ensureDirs(nodes, key.split('/').slice(0, -1).join('/'));
      const now = new Date().toISOString();
      nodes.set(key, {
        type: 'file',
        data: Buffer.from(dataBase64, 'base64'),
        createdAt: nodes.get(key)?.createdAt ?? now,
        modifiedAt: now,
      });
      return { success: true };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  async delete(workspaceId: string, path: string, recursive: boolean): Promise<VolumeResult<void>> {
    try {
      const nodes = this.nodes(workspaceId);
      const key = InMemoryVolumeStore.key(path);
      if (key === '') {
        return {
          success: false,
          error: 'Cannot delete the volume root',
          errorCode: FileErrorCode.INVALID_PATH,
        };
      }
      const node = nodes.get(key);
      if (!node) return InMemoryVolumeStore.missing(path);
      if (node.type === 'directory') {
        const inside = [...nodes.keys()].filter((k) => k.startsWith(`${key}/`));
        if (inside.length > 0 && !recursive) {
          return {
            success: false,
            error: 'Directory is not empty — use recursive: true to delete',
            errorCode: FileErrorCode.INVALID_PATH,
          };
        }
        for (const k of inside) nodes.delete(k);
      }
      nodes.delete(key);
      return { success: true };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  async stat(workspaceId: string, path: string): Promise<VolumeResult<FileStat>> {
    try {
      const nodes = this.nodes(workspaceId);
      const key = InMemoryVolumeStore.key(path);
      const node = nodes.get(key);
      if (key === '') {
        if (nodes.size === 0) return InMemoryVolumeStore.missing(path);
        const now = new Date().toISOString();
        return {
          success: true,
          data: { path: '.', type: 'directory', size: 0, createdAt: now, modifiedAt: now },
        };
      }
      if (!node) return InMemoryVolumeStore.missing(path);
      return {
        success: true,
        data: {
          path: key,
          type: node.type,
          size: node.type === 'directory' ? 0 : node.data.length,
          createdAt: node.createdAt,
          modifiedAt: node.modifiedAt,
        },
      };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  async mkdir(workspaceId: string, path: string): Promise<VolumeResult<void>> {
    try {
      this.ensureDirs(this.nodes(workspaceId), InMemoryVolumeStore.key(path));
      return { success: true };
    } catch (err) {
      return toErrorResult(err);
    }
  }
}

/** List directory entries. @spec VOL-REQ-3 */
export function volumeReadDir(
  ctx: VolumeHandlerContext,
  path: string,
): Promise<VolumeResult<DirEntry[]>> {
  return ctx.volume.readDir(ctx.workspaceId, path);
}

/** Read a file as base64-encoded bytes. @spec VOL-REQ-3 */
export function volumeReadFile(
  ctx: VolumeHandlerContext,
  path: string,
): Promise<VolumeResult<{ data: string; size: number; modifiedAt: string }>> {
  return ctx.volume.readFile(ctx.workspaceId, path);
}

/** Write base64-encoded bytes to a file, creating parent directories. @spec VOL-REQ-3 */
export function volumeWriteFile(
  ctx: VolumeHandlerContext,
  path: string,
  dataBase64: string,
): Promise<VolumeResult<void>> {
  return ctx.volume.writeFile(ctx.workspaceId, path, dataBase64);
}

/** Delete a file or directory; a non-empty directory needs `recursive`. @spec VOL-REQ-3 */
export function volumeDelete(
  ctx: VolumeHandlerContext,
  path: string,
  recursive: boolean,
): Promise<VolumeResult<void>> {
  return ctx.volume.delete(ctx.workspaceId, path, recursive);
}

/** Stat a path: type, size, createdAt, modifiedAt. @spec VOL-REQ-3 */
export function volumeStat(
  ctx: VolumeHandlerContext,
  path: string,
): Promise<VolumeResult<FileStat>> {
  return ctx.volume.stat(ctx.workspaceId, path);
}

/** Create a directory and any missing parents. @spec VOL-REQ-3 */
export function volumeMkdir(ctx: VolumeHandlerContext, path: string): Promise<VolumeResult<void>> {
  return ctx.volume.mkdir(ctx.workspaceId, path);
}

// ---------------------------------------------------------------------------
// Request dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch a `file_volume_*` request message to the appropriate handler.
 *
 * @returns The response message to send back to the instance, or `null`
 *          if the message type is not a recognised volume request.
 *
 * @spec VOL-REQ-2
 */
export async function handleVolumeRequest(
  ctx: VolumeHandlerContext,
  msg: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const type = msg.type as string;
  const requestId = msg.requestId as string;
  const sessionId = msg.sessionId as string;
  const path = (msg.path as string) ?? '';

  if (!VOLUME_REQUEST_TYPES.has(type)) return null;

  const baseResponse = {
    id: `vol-${type}-${requestId}`,
    timestamp: new Date().toISOString(),
    version: '2.0',
    sessionId,
    requestId,
  };

  // VOL-REQ-2: without the `volume` Permission every request is denied.
  if (ctx.permissions?.volume !== true) {
    const reason = 'The volume Permission is not granted to this Installation';
    return {
      ...baseResponse,
      type: `${type}_result`,
      success: false,
      error: reason,
      code: ErrorCode.PERMISSION_DENIED,
      details: { layer: 'permission', permission: 'volume', reason },
      ...(type === 'file_volume_read_dir' ? { entries: [] } : {}),
    };
  }

  switch (type) {
    case 'file_volume_read_dir': {
      const result = await volumeReadDir(ctx, path);
      return {
        ...baseResponse,
        type: 'file_volume_read_dir_result',
        success: result.success,
        entries: result.success ? (result.data ?? []) : [],
        error: result.error,
        code: result.errorCode,
      };
    }

    case 'file_volume_read_file': {
      const result = await volumeReadFile(ctx, path);
      return {
        ...baseResponse,
        type: 'file_volume_read_file_result',
        success: result.success,
        data: result.success ? result.data?.data : undefined,
        error: result.error,
        code: result.errorCode,
      };
    }

    case 'file_volume_write_file': {
      const dataBase64 = (msg.data as string) ?? '';
      const result = await volumeWriteFile(ctx, path, dataBase64);
      return {
        ...baseResponse,
        type: 'file_volume_write_file_result',
        success: result.success,
        error: result.error,
        code: result.errorCode,
      };
    }

    case 'file_volume_delete': {
      const recursive = (msg.recursive as boolean) ?? false;
      const result = await volumeDelete(ctx, path, recursive);
      return {
        ...baseResponse,
        type: 'file_volume_delete_result',
        success: result.success,
        error: result.error,
        code: result.errorCode,
      };
    }

    case 'file_volume_stat': {
      const result = await volumeStat(ctx, path);
      return {
        ...baseResponse,
        type: 'file_volume_stat_result',
        success: result.success,
        stat: result.success ? result.data : undefined,
        error: result.error,
        code: result.errorCode,
      };
    }

    case 'file_volume_mkdir': {
      const result = await volumeMkdir(ctx, path);
      return {
        ...baseResponse,
        type: 'file_volume_mkdir_result',
        success: result.success,
        error: result.error,
        code: result.errorCode,
      };
    }

    default:
      return null;
  }
}

/** Set of all `file_volume_*` request request types. */
export const VOLUME_REQUEST_TYPES = new Set([
  'file_volume_read_dir',
  'file_volume_read_file',
  'file_volume_write_file',
  'file_volume_delete',
  'file_volume_stat',
  'file_volume_mkdir',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a caught error into a VolumeResult with the right error code. */
function toErrorResult(err: unknown): VolumeResult<never> {
  const code = (err as NodeJS.ErrnoException)?.code;
  const message = err instanceof Error ? err.message : String(err);

  // Map common fs error codes to protocol error codes
  let errorCode: string | undefined;
  if (code === ErrorCode.INVALID_ARGUMENTS) {
    errorCode = ErrorCode.INVALID_ARGUMENTS;
  } else if (code === 'ENOENT') {
    errorCode = FileErrorCode.FILE_NOT_FOUND;
  } else if (code === 'EACCES') {
    errorCode = FileErrorCode.INVALID_PATH;
  } else {
    errorCode = code;
  }

  return { success: false, error: message, errorCode };
}

/** Build the error thrown for a path the Volume refuses (VOL-REQ-3). */
function invalidPath(message: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = ErrorCode.INVALID_ARGUMENTS;
  return err;
}
