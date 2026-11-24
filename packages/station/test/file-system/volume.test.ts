/**
 * E2E tests for volume storage — full request dispatch flow.
 *
 * Verifies the complete volume storage lifecycle through the
 * `handleVolumeRequest` dispatcher, covering:
 * - write + read round-trip
 * - readDir with directory structures
 * - stat (size, type, timestamps)
 * - delete (file, empty dir, recursive dir)
 * - path traversal blocked
 * - workspace isolation
 *
 * Spec: STORAGE-VOLUME-SPEC.md §3 (Volume API) and §5 (Physical Layout).
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildVolumeRoot,
  handleVolumeRequest,
  LocalVolumeStore,
  type VolumeHandlerContext,
} from '../../src/file-handlers/volume-handlers.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tempBase: string;

beforeAll(async () => {
  tempBase = await mkdtemp(join(tmpdir(), 'agentapps-e2e-vol-'));
});

afterAll(async () => {
  await rm(tempBase, { recursive: true, force: true });
});

function makeCtx(workspaceId: string, sessionId = 'sess_e2e'): VolumeHandlerContext {
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
    id: 'msg_e2e',
    type,
    timestamp: new Date().toISOString(),
    version: '2.0',
    sessionId: 'sess_e2e',
    requestId: 'cb_e2e',
    path,
    ...extra,
  };
}

function b64(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64');
}

function unb64(b64str: string): string {
  return Buffer.from(b64str, 'base64').toString('utf8');
}

// ---------------------------------------------------------------------------
// E2E: write + read round-trip
// ---------------------------------------------------------------------------

describe('E2E volume: write + read', () => {
  let ctx: VolumeHandlerContext;
  beforeAll(() => {
    ctx = makeCtx('ws_e2e_rw');
  });

  it('writes a file and reads it back with identical content', async () => {
    const content = 'Hello, E2E World!';
    const encoded = b64(content);

    // Write
    const writeResp = await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'hello.txt', { data: encoded }),
    );
    expect(writeResp).not.toBeNull();
    expect(writeResp!.success).toBe(true);
    expect(writeResp!.type).toBe('file_volume_write_file_result');

    // Read back
    const readResp = await handleVolumeRequest(ctx, makeMsg('file_volume_read_file', 'hello.txt'));
    expect(readResp).not.toBeNull();
    expect(readResp!.success).toBe(true);
    expect(readResp!.type).toBe('file_volume_read_file_result');
    expect(readResp!.data).toBe(encoded);
    expect(unb64(readResp!.data as string)).toBe(content);
  });

  it('writes and reads nested paths (auto-creates parent dirs)', async () => {
    const content = 'deeply nested content';
    const encoded = b64(content);

    await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'a/b/c/deep.txt', { data: encoded }),
    );

    const readResp = await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_read_file', 'a/b/c/deep.txt'),
    );
    expect(readResp!.success).toBe(true);
    expect(unb64(readResp!.data as string)).toBe(content);
  });

  it('writes binary content (non-UTF8) correctly', async () => {
    // 256 bytes of binary data
    const binaryBuf = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) binaryBuf[i] = i;
    const encoded = binaryBuf.toString('base64');

    await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'binary.dat', { data: encoded }),
    );

    const readResp = await handleVolumeRequest(ctx, makeMsg('file_volume_read_file', 'binary.dat'));
    expect(readResp!.success).toBe(true);
    expect(readResp!.data).toBe(encoded);

    const decoded = Buffer.from(readResp!.data as string, 'base64');
    expect(decoded.length).toBe(256);
    expect(decoded[0]).toBe(0);
    expect(decoded[255]).toBe(255);
  });

  it('verifies file exists on disk after write', async () => {
    await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'disk-check.txt', { data: b64('on disk') }),
    );

    const volumeRoot = buildVolumeRoot(tempBase, 'ws_e2e_rw');
    const onDisk = await readFile(join(volumeRoot, 'disk-check.txt'), 'utf-8');
    expect(onDisk).toBe('on disk');
  });
});

// ---------------------------------------------------------------------------
// E2E: readDir
// ---------------------------------------------------------------------------

describe('E2E volume: readDir', () => {
  let ctx: VolumeHandlerContext;
  beforeAll(() => {
    ctx = makeCtx('ws_e2e_dir');
  });

  beforeAll(async () => {
    // Create a directory structure via the handler (E2E):
    //   workspace/
    //     file1.txt
    //     file2.txt
    //     subdir/
    //       nested.txt
    //     emptydir/
    await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'file1.txt', { data: b64('content1') }),
    );
    await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'file2.txt', { data: b64('content2') }),
    );
    await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'subdir/nested.txt', { data: b64('nested') }),
    );
    // Create empty dir by writing a temp file then deleting it
    await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'emptydir/.keep', { data: b64('') }),
    );
    await handleVolumeRequest(ctx, makeMsg('file_volume_delete', 'emptydir/.keep'));
  });

  it('lists root directory entries', async () => {
    const resp = await handleVolumeRequest(ctx, makeMsg('file_volume_read_dir', ''));
    expect(resp!.success).toBe(true);
    expect(resp!.type).toBe('file_volume_read_dir_result');

    const entries = resp!.entries as Array<{ name: string; type: string; size: number }>;
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(['emptydir', 'file1.txt', 'file2.txt', 'subdir']);

    // Verify types
    const subdir = entries.find((e) => e.name === 'subdir');
    expect(subdir!.type).toBe('directory');
    expect(subdir!.size).toBe(0);

    const file1 = entries.find((e) => e.name === 'file1.txt');
    expect(file1!.type).toBe('file');
    expect(file1!.size).toBe(8); // 'content1' = 8 bytes
  });

  it('lists subdirectory entries', async () => {
    const resp = await handleVolumeRequest(ctx, makeMsg('file_volume_read_dir', 'subdir'));
    expect(resp!.success).toBe(true);

    const entries = resp!.entries as Array<{ name: string }>;
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe('nested.txt');
  });

  it('lists empty directory', async () => {
    const resp = await handleVolumeRequest(ctx, makeMsg('file_volume_read_dir', 'emptydir'));
    expect(resp!.success).toBe(true);
    expect(resp!.entries).toEqual([]);
  });

  it('fails on non-existent directory', async () => {
    const resp = await handleVolumeRequest(ctx, makeMsg('file_volume_read_dir', 'no-such-dir'));
    expect(resp!.success).toBe(false);
    expect(resp!.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// E2E: stat
// ---------------------------------------------------------------------------

describe('E2E volume: stat', () => {
  let ctx: VolumeHandlerContext;
  beforeAll(() => {
    ctx = makeCtx('ws_e2e_stat');
  });

  beforeAll(async () => {
    await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'myfile.txt', { data: b64('hello world') }),
    );
    await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'mydir/placeholder.txt', { data: b64('x') }),
    );
    await handleVolumeRequest(ctx, makeMsg('file_volume_delete', 'mydir/placeholder.txt'));
  });

  it('stats a file — returns correct size and type', async () => {
    const resp = await handleVolumeRequest(ctx, makeMsg('file_volume_stat', 'myfile.txt'));
    expect(resp!.success).toBe(true);
    expect(resp!.type).toBe('file_volume_stat_result');

    const stat = resp!.stat as Record<string, unknown>;
    expect(stat.type).toBe('file');
    expect(stat.size).toBe(11); // 'hello world' = 11 bytes
    expect(stat.path).toBe('myfile.txt');
    expect(stat.createdAt).toBeDefined();
    expect(stat.modifiedAt).toBeDefined();
  });

  it('stats a directory — type is directory, size is 0', async () => {
    const resp = await handleVolumeRequest(ctx, makeMsg('file_volume_stat', 'mydir'));
    expect(resp!.success).toBe(true);

    const stat = resp!.stat as Record<string, unknown>;
    expect(stat.type).toBe('directory');
    expect(stat.size).toBe(0);
    expect(stat.path).toBe('mydir');
  });

  it('stats the root directory', async () => {
    const resp = await handleVolumeRequest(ctx, makeMsg('file_volume_stat', ''));
    expect(resp!.success).toBe(true);

    const stat = resp!.stat as Record<string, unknown>;
    expect(stat.type).toBe('directory');
    expect(stat.path).toBe('.');
  });

  it('fails on non-existent path', async () => {
    const resp = await handleVolumeRequest(ctx, makeMsg('file_volume_stat', 'no-such-file'));
    expect(resp!.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E2E: delete
// ---------------------------------------------------------------------------

describe('E2E volume: delete', () => {
  let ctx: VolumeHandlerContext;
  beforeAll(() => {
    ctx = makeCtx('ws_e2e_del');
  });

  it('deletes a file and verifies it no longer exists', async () => {
    // Write
    await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'to-delete.txt', { data: b64('delete me') }),
    );

    // Delete
    const delResp = await handleVolumeRequest(ctx, makeMsg('file_volume_delete', 'to-delete.txt'));
    expect(delResp!.success).toBe(true);
    expect(delResp!.type).toBe('file_volume_delete_result');

    // Verify gone — read should fail
    const readResp = await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_read_file', 'to-delete.txt'),
    );
    expect(readResp!.success).toBe(false);
  });

  it('fails to delete a non-existent file', async () => {
    const resp = await handleVolumeRequest(ctx, makeMsg('file_volume_delete', 'never-existed.txt'));
    expect(resp!.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E2E: delete recursive
// ---------------------------------------------------------------------------

describe('E2E volume: delete recursive', () => {
  let ctx: VolumeHandlerContext;
  beforeAll(() => {
    ctx = makeCtx('ws_e2e_recdel');
  });

  it('creates a directory with content, deletes recursively, verifies gone', async () => {
    // Create structure: parentdir/child1.txt, parentdir/subdir/child2.txt
    await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'parentdir/child1.txt', { data: b64('child1') }),
    );
    await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', 'parentdir/subdir/child2.txt', { data: b64('child2') }),
    );

    // Delete without recursive should fail (non-empty)
    const failResp = await handleVolumeRequest(ctx, makeMsg('file_volume_delete', 'parentdir'));
    expect(failResp!.success).toBe(false);
    expect(failResp!.error).toContain('not empty');

    // Delete with recursive should succeed
    const delResp = await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_delete', 'parentdir', { recursive: true }),
    );
    expect(delResp!.success).toBe(true);

    // Verify directory is gone — stat should fail
    const statResp = await handleVolumeRequest(ctx, makeMsg('file_volume_stat', 'parentdir'));
    expect(statResp!.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E2E: path traversal blocked
// ---------------------------------------------------------------------------

describe('E2E volume: path traversal blocked', () => {
  let ctx: VolumeHandlerContext;
  beforeAll(() => {
    ctx = makeCtx('ws_e2e_traversal');
  });

  it('blocks read_file with ../../etc/passwd', async () => {
    const resp = await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_read_file', '../../etc/passwd'),
    );
    expect(resp!.success).toBe(false);
    expect(resp!.error).toContain('Path traversal');
  });

  it('blocks write_file with ../evil.txt', async () => {
    const resp = await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_write_file', '../evil.txt', { data: b64('evil') }),
    );
    expect(resp!.success).toBe(false);
    expect(resp!.error).toContain('Path traversal');
  });

  it('blocks delete with ../secret.txt', async () => {
    const resp = await handleVolumeRequest(ctx, makeMsg('file_volume_delete', '../secret.txt'));
    expect(resp!.success).toBe(false);
    expect(resp!.error).toContain('Path traversal');
  });

  it('blocks stat with ../../etc/shadow', async () => {
    const resp = await handleVolumeRequest(ctx, makeMsg('file_volume_stat', '../../etc/shadow'));
    expect(resp!.success).toBe(false);
    expect(resp!.error).toContain('Path traversal');
  });

  it('blocks read_dir with ../', async () => {
    const resp = await handleVolumeRequest(ctx, makeMsg('file_volume_read_dir', '../'));
    expect(resp!.success).toBe(false);
    expect(resp!.error).toContain('Path traversal');
  });

  it('blocks embedded .. in nested path (sub/../../etc/passwd)', async () => {
    const resp = await handleVolumeRequest(
      ctx,
      makeMsg('file_volume_read_file', 'sub/../../etc/passwd'),
    );
    expect(resp!.success).toBe(false);
    expect(resp!.error).toContain('Path traversal');
  });
});

// ---------------------------------------------------------------------------
// E2E: workspace isolation
// ---------------------------------------------------------------------------

describe('E2E volume: workspace isolation', () => {
  let ctxA: VolumeHandlerContext;
  let ctxB: VolumeHandlerContext;
  beforeAll(() => {
    ctxA = makeCtx('ws_e2e_iso_a');
    ctxB = makeCtx('ws_e2e_iso_b');
  });

  it('workspace A writes a file and can read it', async () => {
    await handleVolumeRequest(
      ctxA,
      makeMsg('file_volume_write_file', 'private.txt', { data: b64('private to A') }),
    );

    const resp = await handleVolumeRequest(ctxA, makeMsg('file_volume_read_file', 'private.txt'));
    expect(resp!.success).toBe(true);
    expect(unb64(resp!.data as string)).toBe('private to A');
  });

  it('workspace B cannot read workspace A file', async () => {
    const resp = await handleVolumeRequest(ctxB, makeMsg('file_volume_read_file', 'private.txt'));
    expect(resp!.success).toBe(false);
  });

  it('workspace B cannot list workspace A files', async () => {
    const resp = await handleVolumeRequest(ctxB, makeMsg('file_volume_read_dir', ''));
    // B has no volume root — either fails or returns empty, never A's files
    if (resp!.success) {
      const entries = resp!.entries as Array<{ name: string }>;
      expect(entries.find((e) => e.name === 'private.txt')).toBeUndefined();
    } else {
      expect(resp!.success).toBe(false);
    }
  });

  it('workspaces have separate physical directories', () => {
    const rootA = buildVolumeRoot(tempBase, 'ws_e2e_iso_a');
    const rootB = buildVolumeRoot(tempBase, 'ws_e2e_iso_b');
    expect(rootA).not.toBe(rootB);
    expect(rootA).toContain('ws_e2e_iso_a');
    expect(rootB).toContain('ws_e2e_iso_b');
  });

  it('workspace B writing same filename does not overwrite A file', async () => {
    // B writes its own file with the same name
    await handleVolumeRequest(
      ctxB,
      makeMsg('file_volume_write_file', 'private.txt', { data: b64('private to B') }),
    );

    // A's file should still have A's content
    const respA = await handleVolumeRequest(ctxA, makeMsg('file_volume_read_file', 'private.txt'));
    expect(respA!.success).toBe(true);
    expect(unb64(respA!.data as string)).toBe('private to A');

    // B's file should have B's content
    const respB = await handleVolumeRequest(ctxB, makeMsg('file_volume_read_file', 'private.txt'));
    expect(respB!.success).toBe(true);
    expect(unb64(respB!.data as string)).toBe('private to B');
  });
});
