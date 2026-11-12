/**
 * Object store for the Agent Apps Station.
 *
 * An Object is an immutable binary blob an App uploads once and gets a URL
 * for. Objects belong to one Installation and live on disk under
 *
 *   {volumesBasePath}/ws_{workspaceId}/objects/{installationId}/{objectId}
 *   {volumesBasePath}/ws_{workspaceId}/objects/{installationId}/{objectId}.meta.json
 *
 * plus one index entry per object at
 *
 *   {volumesBasePath}/_objects/{objectId}.json  → { workspaceId, installationId }
 *
 * so the HTTP endpoint can locate an object from its id alone. Ids are random
 * and unguessable (`obj_` + 32 hex chars). There is no update operation: a
 * new version of a file is a new object.
 *
 * Visibility:
 * - `private` (default): served to Apps of the same Workspace through
 *   `object_get`, and over HTTP only with a valid signed link token.
 * - `public`: served over HTTP to anyone who holds the URL, permanently.
 *
 * Implements the `object_put`, `object_get`, `object_delete`, `object_list`
 * and `object_link` Requests.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ObjectInfo, ObjectVisibility } from '@agentapps/protocol';
import { OBJECT_REQUEST_TYPES } from '@agentapps/protocol';
import { createObjectLinkToken, validateObjectLinkToken } from './signed-url.js';

/** Metadata persisted next to each object. */
export interface StoredObjectMeta extends ObjectInfo {
  workspaceId: string;
  installationId: string;
}

/** Scope of the Request: which Installation, in which Workspace, is asking. */
export interface ObjectRequestScope {
  workspaceId: string;
  installationId: string;
}

export interface ObjectStoreOptions {
  /** Physical base path (same root the Volume uses). */
  volumesBasePath: string;
  /** Station secret for signing temporary links. */
  stationSecret: string;
  /** Public base URL of the Station, used to build object URLs. */
  publicUrl: string;
}

/** Outcome of resolving an HTTP request for an object. */
export type ObjectServeResult =
  | { status: 200; path: string; meta: StoredObjectMeta }
  | { status: 401 | 404; error: string };

const ID_PREFIX = 'obj_';
const META_SUFFIX = '.meta.json';

/** Generate an unguessable object id. */
export function generateObjectId(): string {
  return `${ID_PREFIX}${randomBytes(16).toString('hex')}`;
}

function isObjectId(value: string): boolean {
  return /^obj_[0-9a-f]{32}$/.test(value);
}

export class ObjectStore {
  private readonly basePath: string;
  private readonly secret: string;
  private readonly publicUrl: string;

  constructor(options: ObjectStoreOptions) {
    this.basePath = options.volumesBasePath;
    this.secret = options.stationSecret;
    this.publicUrl = options.publicUrl.replace(/\/+$/, '');
  }

  /** The permanent URL of an object. */
  urlFor(objectId: string): string {
    return `${this.publicUrl}/objects/${objectId}`;
  }

  private dirFor(scope: ObjectRequestScope): string {
    return join(this.basePath, `ws_${scope.workspaceId}`, 'objects', scope.installationId);
  }

  private indexPath(objectId: string): string {
    return join(this.basePath, '_objects', `${objectId}.json`);
  }

  /** Store a new object and return its metadata. */
  async put(
    scope: ObjectRequestScope,
    data: Buffer,
    options: {
      contentType: string;
      filename?: string;
      visibility?: ObjectVisibility;
      metadata?: Record<string, string>;
    },
  ): Promise<StoredObjectMeta> {
    const objectId = generateObjectId();
    const dir = this.dirFor(scope);
    await mkdir(dir, { recursive: true });
    await mkdir(join(this.basePath, '_objects'), { recursive: true });

    const meta: StoredObjectMeta = {
      objectId,
      url: this.urlFor(objectId),
      size: data.length,
      contentType: options.contentType,
      visibility: options.visibility ?? 'private',
      createdAt: new Date().toISOString(),
      ...(options.filename !== undefined ? { filename: options.filename } : {}),
      ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
      workspaceId: scope.workspaceId,
      installationId: scope.installationId,
    };

    await writeFile(join(dir, objectId), data);
    await writeFile(join(dir, `${objectId}${META_SUFFIX}`), JSON.stringify(meta));
    await writeFile(
      this.indexPath(objectId),
      JSON.stringify({ workspaceId: scope.workspaceId, installationId: scope.installationId }),
    );
    return meta;
  }

  /** Locate an object's metadata by id, whatever Installation owns it. */
  async describe(objectId: string): Promise<StoredObjectMeta | null> {
    if (!isObjectId(objectId)) return null;
    let owner: ObjectRequestScope;
    try {
      owner = JSON.parse(await readFile(this.indexPath(objectId), 'utf8')) as ObjectRequestScope;
    } catch {
      return null;
    }
    try {
      const raw = await readFile(join(this.dirFor(owner), `${objectId}${META_SUFFIX}`), 'utf8');
      return JSON.parse(raw) as StoredObjectMeta;
    } catch {
      return null;
    }
  }

  /**
   * Read an object on behalf of an Installation. Any Installation of the same
   * Workspace may read it; other Workspaces see nothing.
   */
  async get(
    scope: ObjectRequestScope,
    objectId: string,
  ): Promise<{ meta: StoredObjectMeta; data: Buffer } | null> {
    const meta = await this.describe(objectId);
    if (!meta || meta.workspaceId !== scope.workspaceId) return null;
    try {
      const data = await readFile(join(this.dirFor(meta), objectId));
      return { meta, data };
    } catch {
      return null;
    }
  }

  /** Delete an object. Only the owning Installation may delete it. */
  async delete(scope: ObjectRequestScope, objectId: string): Promise<boolean> {
    const meta = await this.describe(objectId);
    if (
      !meta ||
      meta.workspaceId !== scope.workspaceId ||
      meta.installationId !== scope.installationId
    ) {
      return false;
    }
    const dir = this.dirFor(meta);
    await rm(join(dir, objectId), { force: true });
    await rm(join(dir, `${objectId}${META_SUFFIX}`), { force: true });
    await rm(this.indexPath(objectId), { force: true });
    return true;
  }

  /** List the Installation's objects, newest first, with cursor pagination. */
  async list(
    scope: ObjectRequestScope,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ objects: StoredObjectMeta[]; nextCursor?: string }> {
    const dir = this.dirFor(scope);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return { objects: [] };
    }
    const metas: StoredObjectMeta[] = [];
    for (const name of names) {
      if (!name.endsWith(META_SUFFIX)) continue;
      try {
        metas.push(JSON.parse(await readFile(join(dir, name), 'utf8')) as StoredObjectMeta);
      } catch {
        // A half-written meta file is skipped.
      }
    }
    metas.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

    let start = 0;
    if (options.cursor) {
      const at = metas.findIndex((m) => m.objectId === options.cursor);
      start = at >= 0 ? at + 1 : metas.length;
    }
    const limit = options.limit ?? 100;
    const page = metas.slice(start, start + limit);
    const last = page[page.length - 1];
    const hasMore = start + limit < metas.length;
    return { objects: page, ...(hasMore && last ? { nextCursor: last.objectId } : {}) };
  }

  /** Create a signed temporary link to an object of the same Workspace. */
  async link(
    scope: ObjectRequestScope,
    objectId: string,
    expiresIn: number,
  ): Promise<{ url: string; expiresAt: string } | null> {
    const meta = await this.describe(objectId);
    if (!meta || meta.workspaceId !== scope.workspaceId) return null;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const token = createObjectLinkToken({ objectId, expiresAt }, this.secret);
    return { url: `${this.urlFor(objectId)}?token=${token}`, expiresAt };
  }

  /**
   * Resolve an HTTP request for `GET /objects/{id}[?token=…]`.
   *
   * Public objects are served to anyone. Private objects need a valid link
   * token for that object; otherwise 401. Unknown ids are 404.
   */
  async resolveForServing(objectId: string, token?: string): Promise<ObjectServeResult> {
    const meta = await this.describe(objectId);
    if (!meta) return { status: 404, error: 'Object not found' };
    if (meta.visibility !== 'public') {
      if (!token) return { status: 401, error: 'Private object: a link token is required' };
      const check = validateObjectLinkToken(token, this.secret);
      if (!check.valid || check.payload?.objectId !== objectId) {
        return { status: 401, error: check.reason ?? 'Invalid token' };
      }
    }
    return { status: 200, path: join(this.dirFor(meta), objectId), meta };
  }
}

/** Strip the store-only fields before an ObjectInfo leaves the Station. */
export function toObjectInfo(meta: StoredObjectMeta): ObjectInfo {
  const { workspaceId: _ws, installationId: _inst, ...info } = meta;
  return info;
}

/**
 * Answer one `object_*` Request with its `object_*_result`.
 *
 * @returns the result message, or `null` when the type is not an object Request.
 */
export async function handleObjectRequest(
  store: ObjectStore,
  scope: ObjectRequestScope,
  msg: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const type = msg.type as string;
  if (!OBJECT_REQUEST_TYPES.has(type)) return null;
  const requestId = msg.requestId as string;
  const sessionId = msg.sessionId as string;
  const base = {
    id: `${type}-${requestId}`,
    timestamp: new Date().toISOString(),
    version: '2.0',
    sessionId,
    requestId,
    type: `${type}_result`,
  };

  try {
    switch (type) {
      case 'object_put': {
        const data = Buffer.from((msg.data as string) ?? '', 'base64');
        const meta = await store.put(scope, data, {
          contentType: msg.contentType as string,
          filename: msg.filename as string | undefined,
          visibility: msg.visibility as ObjectVisibility | undefined,
          metadata: msg.metadata as Record<string, string> | undefined,
        });
        return { ...base, success: true, ...toObjectInfo(meta) };
      }
      case 'object_get': {
        const found = await store.get(scope, msg.objectId as string);
        if (!found) return { ...base, success: false, error: 'Object not found' };
        return {
          ...base,
          success: true,
          ...toObjectInfo(found.meta),
          data: found.data.toString('base64'),
        };
      }
      case 'object_delete': {
        const deleted = await store.delete(scope, msg.objectId as string);
        return deleted
          ? { ...base, success: true }
          : { ...base, success: false, error: 'Object not found' };
      }
      case 'object_list': {
        const page = await store.list(scope, {
          limit: msg.limit as number | undefined,
          cursor: msg.cursor as string | undefined,
        });
        return {
          ...base,
          success: true,
          objects: page.objects.map(toObjectInfo),
          ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        };
      }
      case 'object_link': {
        const link = await store.link(scope, msg.objectId as string, msg.expiresIn as number);
        if (!link) return { ...base, success: false, error: 'Object not found' };
        return { ...base, success: true, ...link };
      }
      default:
        return null;
    }
  } catch (err) {
    return { ...base, success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
