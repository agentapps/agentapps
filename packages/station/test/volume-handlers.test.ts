/**
 * Tests for volume storage handlers (file_volume_* requests).
 *
 * Verifies:
 * - All 5 requests respond correctly
 * - Path traversal is blocked
 * - Workspace isolation (one workspace cannot read another's files)
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildVolumeRoot,
  handleVolumeRequest,
  LocalVolumeStore,
  resolveVolumePath,
  type VolumeHandlerContext,
} from '../src/file-handlers/volume-handlers.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tempBase: string;

beforeAll(async () => {
  tempBase = await mkdtemp(join(tmpdir(), 'agentapps-vol-test-'));
});

afterAll(async () => {
  await rm(tempBase, { recursive: true, force: true });
});

function makeCtx(
  workspaceId: string,
  installationId: string,
  sessionId = 'sess_test',
): VolumeHandlerContext {
  return {
    volume: new LocalVolumeStore(tempBase),
    workspaceId,
    sessionId,
    permissions: { volume: true },
  };
}

function makeMsg(
  type: string,
  path: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'msg_test',
    type,
    timestamp: new Date().toISOString(),
    version: '2.0',
    sessionId: 'sess_test',
    requestId: 'cb_test',
    path,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// resolveVolumePath — path traversal security
// ---------------------------------------------------------------------------

describe('resolveVolumePath', () => {
  const volumeRoot = '/tmp/test-vol-root';

  it('resolves a simple relative path', () => {
    const result = resolveVolumePath(volumeRoot, 'file.txt');
    expect(result).toBe('/tmp/test-vol-root/file.txt');
  });

  it('resolves a nested relative path', () => {
    const result = resolveVolumePath(volumeRoot, 'sub/dir/file.txt');
    expect(result).toBe('/tmp/test-vol-root/sub/dir/file.txt');
  });

  it('resolves empty path to volume root', () => {
    const result = resolveVolumePath(volumeRoot, '.');
    expect(result).toBe('/tmp/test-vol-root');
  });

  it('rejects path with .. segment', () => {
    expect(() => resolveVolumePath(volumeRoot, '../etc/passwd')).toThrow('Path traversal detected');
  });

  it('rejects path with embedded .. segment', () => {
    expect(() => resolveVolumePath(volumeRoot, 'sub/../../etc/passwd')).toThrow(
      'Path traversal detected',
    );
  });

  it('allows filenames containing .. (not as a segment)', () => {
    const result = resolveVolumePath(volumeRoot, 'file..txt');
    expect(result).toBe('/tmp/test-vol-root/file..txt');
  });

  it('allows filenames starting with .. (not as a segment)', () => {
    const result = resolveVolumePath(volumeRoot, '..foo.txt');
    expect(result).toBe('/tmp/test-vol-root/..foo.txt');
  });
});

// ---------------------------------------------------------------------------
// buildVolumeRoot
// ---------------------------------------------------------------------------

describe('buildVolumeRoot', () => {
  it('constructs the correct path', () => {
    const result = buildVolumeRoot('/data', 'ws1');
    expect(result).toBe('/data/ws_ws1/workspace');
  });
});

// ---------------------------------------------------------------------------
// file_volume_write_file + file_volume_read_file round-trip
// ---------------------------------------------------------------------------

describe('file_volume_write_file + file_volume_read_file', () => {
  let ctx: VolumeHandlerContext;

  beforeEach(() => {
    ctx = makeCtx('ws-test-rw', 'inst-test-rw');
  });

  it('writes and reads back a file', async () => {
    const content = Buffer.from('Hello, World!').toString('base64');

    // Write
    const writeMsg = makeMsg('file_volume_write_file', 'hello.txt', { data: content });
    const writeResp = await handleVolumeRequest(ctx, writeMsg);
    expect(writeResp).not.toBeNull();
    expect(writeResp!.success).toBe(true);
    expect(writeResp!.type).toBe('file_volume_write_file_result');

    // Read back
    const readMsg = makeMsg('file_volume_read_file', 'hello.txt');
    const readResp = await handleVolumeRequest(ctx, readMsg);
    expect(readResp).not.toBeNull();
    expect(readResp!.success).toBe(true);
    expect(readResp!.type).toBe('file_volume_read_file_result');
    expect(readResp!.data).toBe(content);

    // Verify on disk
    const volumeRoot = buildVolumeRoot(tempBase, 'ws-test-rw');
    const onDisk = await readFile(join(volumeRoot, 'hello.txt'), 'utf-8');
    expect(onDisk).toBe('Hello, World!');
  });

  it('creates parent directories when writing nested paths', async () => {
    const content = Buffer.from('nested').toString('base64');

    const writeMsg = makeMsg('file_volume_write_file', 'a/b/c/deep.txt', { data: content });
    const writeResp = await handleVolumeRequest(ctx, writeMsg);
    expect(writeResp!.success).toBe(true);

    // Read back
    const readMsg = makeMsg('file_volume_read_file', 'a/b/c/deep.txt');
    const readResp = await handleVolumeRequest(ctx, readMsg);
    expect(readResp!.success).toBe(true);
    expect(readResp!.data).toBe(content);
  });

  it('fails to read a non-existent file', async () => {
    const readMsg = makeMsg('file_volume_read_file', 'does-not-exist.txt');
    const readResp = await handleVolumeRequest(ctx, readMsg);
    expect(readResp!.success).toBe(false);
    expect(readResp!.error).toBeDefined();
  });

  it('fails to read a directory as a file', async () => {
    // First create a directory
    const writeMsg = makeMsg('file_volume_write_file', 'somedir/file.txt', {
      data: Buffer.from('x').toString('base64'),
    });
    await handleVolumeRequest(ctx, writeMsg);

    // Try to read the directory
    const readMsg = makeMsg('file_volume_read_file', 'somedir');
    const readResp = await handleVolumeRequest(ctx, readMsg);
    expect(readResp!.success).toBe(false);
    expect(readResp!.error).toContain('directory');
  });
});

// ---------------------------------------------------------------------------
// file_volume_read_dir
// ---------------------------------------------------------------------------

describe('file_volume_read_dir', () => {
  let ctx: VolumeHandlerContext;

  beforeEach(async () => {
    ctx = makeCtx('ws-test-dir', 'inst-test-dir');
    const volumeRoot = buildVolumeRoot(tempBase, 'ws-test-dir');
    await mkdir(join(volumeRoot, 'subdir'), { recursive: true });
    await writeFile(join(volumeRoot, 'file1.txt'), 'content1');
    await writeFile(join(volumeRoot, 'file2.txt'), 'content2');
  });

  it('lists entries in the root directory', async () => {
    const msg = makeMsg('file_volume_read_dir', '');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(true);
    expect(resp!.type).toBe('file_volume_read_dir_result');

    const entries = resp!.entries as Array<{ name: string; type: string }>;
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(['file1.txt', 'file2.txt', 'subdir']);

    const subdir = entries.find((e) => e.name === 'subdir');
    expect(subdir!.type).toBe('directory');

    const file1 = entries.find((e) => e.name === 'file1.txt');
    expect(file1!.type).toBe('file');
    expect(file1!.size).toBe(8); // 'content1' is 8 bytes
  });

  it('lists entries in a subdirectory', async () => {
    const msg = makeMsg('file_volume_read_dir', 'subdir');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(true);
    expect(resp!.entries).toEqual([]);
  });

  it('fails on non-existent directory', async () => {
    const msg = makeMsg('file_volume_read_dir', 'no-such-dir');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(false);
    expect(resp!.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// file_volume_delete
// ---------------------------------------------------------------------------

describe('file_volume_delete', () => {
  let ctx: VolumeHandlerContext;

  beforeEach(async () => {
    ctx = makeCtx('ws-test-del', 'inst-test-del');
    const volumeRoot = buildVolumeRoot(tempBase, 'ws-test-del');
    await mkdir(volumeRoot, { recursive: true });
    await writeFile(join(volumeRoot, 'file.txt'), 'content');
    await mkdir(join(volumeRoot, 'dirwithfiles'), { recursive: true });
    await writeFile(join(volumeRoot, 'dirwithfiles', 'inner.txt'), 'inner');
    await mkdir(join(volumeRoot, 'emptydir'), { recursive: true });
  });

  it('deletes a file', async () => {
    const msg = makeMsg('file_volume_delete', 'file.txt');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(true);

    // Verify it's gone
    const readMsg = makeMsg('file_volume_read_file', 'file.txt');
    const readResp = await handleVolumeRequest(ctx, readMsg);
    expect(readResp!.success).toBe(false);
  });

  it('deletes an empty directory without recursive flag', async () => {
    const msg = makeMsg('file_volume_delete', 'emptydir');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(true);
  });

  it('fails to delete a non-empty directory without recursive flag', async () => {
    const msg = makeMsg('file_volume_delete', 'dirwithfiles');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(false);
    expect(resp!.error).toContain('not empty');
  });

  it('deletes a non-empty directory with recursive flag', async () => {
    const msg = makeMsg('file_volume_delete', 'dirwithfiles', { recursive: true });
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(true);
  });

  it('fails on non-existent path', async () => {
    const msg = makeMsg('file_volume_delete', 'no-such-file.txt');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// file_volume_stat
// ---------------------------------------------------------------------------

describe('file_volume_stat', () => {
  let ctx: VolumeHandlerContext;

  beforeEach(async () => {
    ctx = makeCtx('ws-test-stat', 'inst-test-stat');
    const volumeRoot = buildVolumeRoot(tempBase, 'ws-test-stat');
    await mkdir(volumeRoot, { recursive: true });
    await writeFile(join(volumeRoot, 'file.txt'), 'hello world');
    await mkdir(join(volumeRoot, 'mydir'), { recursive: true });
  });

  it('stats a file', async () => {
    const msg = makeMsg('file_volume_stat', 'file.txt');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(true);
    expect(resp!.type).toBe('file_volume_stat_result');

    const stat = resp!.stat;
    expect(stat!.type).toBe('file');
    expect(stat!.size).toBe(11); // 'hello world' is 11 bytes
    expect(stat!.path).toBe('file.txt');
    expect(stat!.createdAt).toBeDefined();
    expect(stat!.modifiedAt).toBeDefined();
  });

  it('stats a directory', async () => {
    const msg = makeMsg('file_volume_stat', 'mydir');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(true);

    const stat = resp!.stat;
    expect(stat!.type).toBe('directory');
    expect(stat!.size).toBe(0);
    expect(stat!.path).toBe('mydir');
  });

  it('stats the root directory', async () => {
    const msg = makeMsg('file_volume_stat', '');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(true);

    const stat = resp!.stat;
    expect(stat!.type).toBe('directory');
    expect(stat!.path).toBe('.');
  });

  it('fails on non-existent path', async () => {
    const msg = makeMsg('file_volume_stat', 'no-such-file');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Path traversal security
// ---------------------------------------------------------------------------

describe('Path traversal protection', () => {
  let ctx: VolumeHandlerContext;

  beforeEach(async () => {
    ctx = makeCtx('ws-traversal', 'inst-traversal');
    const volumeRoot = buildVolumeRoot(tempBase, 'ws-traversal');
    await mkdir(volumeRoot, { recursive: true });
    await writeFile(join(volumeRoot, 'safe.txt'), 'safe content');
    // Create a secret file outside the volume root (but inside the installation dir)
    await mkdir(join(tempBase, 'ws-traversal', 'inst-traversal'), { recursive: true });
    await writeFile(join(tempBase, 'ws-traversal', 'inst-traversal', 'secret.txt'), 'SECRET');
  });

  it('blocks read_dir with .. in path', async () => {
    const msg = makeMsg('file_volume_read_dir', '../');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(false);
    expect(resp!.error).toContain('Path traversal');
  });

  it('blocks read_file with .. in path', async () => {
    const msg = makeMsg('file_volume_read_file', '../../etc/passwd');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(false);
    expect(resp!.error).toContain('Path traversal');
  });

  it('blocks write_file with .. in path', async () => {
    const msg = makeMsg('file_volume_write_file', '../evil.txt', {
      data: Buffer.from('evil').toString('base64'),
    });
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(false);
    expect(resp!.error).toContain('Path traversal');
  });

  it('blocks delete with .. in path', async () => {
    const msg = makeMsg('file_volume_delete', '../secret.txt');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(false);
    expect(resp!.error).toContain('Path traversal');
  });

  it('blocks stat with .. in path', async () => {
    const msg = makeMsg('file_volume_stat', '../secret.txt');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp!.success).toBe(false);
    expect(resp!.error).toContain('Path traversal');
  });
});

// ---------------------------------------------------------------------------
// Workspace isolation
// ---------------------------------------------------------------------------

describe('Workspace isolation', () => {
  let ctxA: VolumeHandlerContext;
  let ctxB: VolumeHandlerContext;

  beforeEach(async () => {
    ctxA = makeCtx('ws-iso-a', 'inst-A');
    ctxB = makeCtx('ws-iso-b', 'inst-B');

    // Write a file in workspace A
    const writeMsg = makeMsg('file_volume_write_file', 'private.txt', {
      data: Buffer.from('private to A').toString('base64'),
    });
    await handleVolumeRequest(ctxA, writeMsg);
  });

  it('workspace A can read its own file', async () => {
    const readMsg = makeMsg('file_volume_read_file', 'private.txt');
    const resp = await handleVolumeRequest(ctxA, readMsg);
    expect(resp!.success).toBe(true);
    expect(resp!.data).toBe(Buffer.from('private to A').toString('base64'));
  });

  it('workspace B cannot read workspace A file', async () => {
    const readMsg = makeMsg('file_volume_read_file', 'private.txt');
    const resp = await handleVolumeRequest(ctxB, readMsg);
    expect(resp!.success).toBe(false);
  });

  it('workspace B cannot list workspace A file (separate dirs)', async () => {
    // Workspace B has no volume root yet — readDir should fail (no such dir)
    // or return empty, but never expose A's files
    const listMsg = makeMsg('file_volume_read_dir', '');
    const resp = await handleVolumeRequest(ctxB, listMsg);
    // B's volume root doesn't exist, so this should fail
    if (resp!.success) {
      const entries = resp!.entries as Array<{ name: string }>;
      expect(entries.find((e) => e.name === 'private.txt')).toBeUndefined();
    } else {
      // Acceptable — the directory doesn't exist for B
      expect(resp!.success).toBe(false);
    }
  });

  it('workspaces have separate physical directories', () => {
    const rootA = buildVolumeRoot(tempBase, 'ws-iso-a');
    const rootB = buildVolumeRoot(tempBase, 'ws-iso-b');
    expect(rootA).not.toBe(rootB);
    expect(rootA).toContain('ws-iso-a');
    expect(rootB).toContain('ws-iso-b');
  });
});

// ---------------------------------------------------------------------------
// Unknown request type
// ---------------------------------------------------------------------------

describe('Unknown request type', () => {
  it('returns null for unknown type', async () => {
    const ctx = makeCtx('ws-unknown', 'inst-unknown');
    const msg = makeMsg('file_volume_unknown', 'test.txt');
    const resp = await handleVolumeRequest(ctx, msg);
    expect(resp).toBeNull();
  });
});
