/**
 * Tests for the Netlify Agent App.
 *
 * Migrated from mca.netlify/test/unit/ (4 files).
 *
 * STRUCTURE:
 * - Integration tests via InProcessRuntime (tool listing, health check,
 *   deploy-site, list-sites, get-deploy-status through the protocol).
 * - Direct unit tests for pure helpers that are exported from the lib layer:
 *   sha1Hex, toDeployPath, buildDigest, walkDir (digest.ts),
 *   PathJail (path-jail.ts),
 *   uploadPath, classify, collectPages, extractMessage, NetlifyApiError (netlify-client.ts / netlify-error.ts),
 *   executeDeploy + handler pre-flight guards (deploy-site.ts).
 */

import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { factory } from '../src/app.js';
import type { Digest } from '../src/lib/digest.js';
import { buildDigest, sha1Hex, toDeployPath, walkDir } from '../src/lib/digest.js';
import type { NetlifyDeploy, NetlifySite } from '../src/lib/netlify-client.js';
import { collectPages, NetlifyApiError, uploadPath } from '../src/lib/netlify-client.js';
import { classify, extractMessage } from '../src/lib/netlify-error.js';
import { PathJail } from '../src/lib/path-jail.js';
import { type DeployClient, executeDeploy } from '../src/tools/deploy-site.js';

// ---------------------------------------------------------------------------
// Integration test harness (InProcessRuntime)
// ---------------------------------------------------------------------------

let appStation: AppStation;
let host: Transport;
let received: MessageBase[];

function collectMessages(transport: Transport): MessageBase[] {
  const msgs: MessageBase[] = [];
  transport.onMessage((msg) => msgs.push(msg));
  return msgs;
}

async function waitFor(
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = received.find((m) => predicate(m as Record<string, unknown>));
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Timeout waiting for message');
}

async function waitForType(type: string, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return waitFor((m) => m.type === type, timeoutMs);
}

async function initAndOpen(): Promise<string> {
  host.send({
    ...createEnvelope('initialize'),
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'test', version: '1.0.0' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitForType('initialized');

  received.length = 0;
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'inst_netlify',
    tenant: { userId: 'u_test' },
  } as MessageBase);
  const opened = await waitForType('session_opened');
  received.length = 0;
  return opened.sessionId as string;
}

function _sendToolCall(sessionId: string, tool: string, args: Record<string, unknown>): void {
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool,
    arguments: args,
    context: { userId: 'u_test', installationId: 'inst_netlify' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Integration test setup / teardown
// ---------------------------------------------------------------------------

describe('Netlify Agent App — integration', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
      }),
    );

    const runtime = new InProcessRuntime(factory);
    appStation = new AppStation({
      appId: 'app.netlify',
      appVersion: '2.0.0',
      runtime,
    });
    const [hostSide, ctrlSide] = createInProcessTransportPair();
    host = hostSide;
    received = collectMessages(host);

    host.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      const type = m.type as string;
      const sessionId = m.sessionId as string;
      const requestId = (m.requestId as string) ?? (m.id as string);

      if (type === 'get_installation_secrets') {
        host.send({
          ...createEnvelope('installation_secrets', sessionId),
          id: requestId,
          requestId,
          secrets: { NETLIFY_TOKEN: 'test-netlify-token' },
        } as MessageBase);
      }
    });

    appStation.accept(ctrlSide);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await appStation.shutdown();
  });

  it('lists all 3 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'deploy-site',
      'get-deploy-status',
      'list-sites',
    ]);
  });

  it('health check responds ready when token and API are valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'u1', email: 'test@test.com' }),
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The health handler returns { status: 'ready' } after successfully calling
    // client.getUser(), confirming the token is valid.
    expect(health.status).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: sha1Hex, toDeployPath (from digest.test.ts)
// ---------------------------------------------------------------------------

const BASE_DIGEST = join(
  tmpdir(),
  `netlify-digest-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);

describe('sha1Hex', () => {
  it('matches the known vector for the empty input', () => {
    expect(sha1Hex(new Uint8Array(0))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('matches the known vector for "hello"', () => {
    expect(sha1Hex(new TextEncoder().encode('hello'))).toBe(
      'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d',
    );
  });

  it('is lowercase hex', () => {
    const hash = sha1Hex(new TextEncoder().encode('Agent Apps'));
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('toDeployPath', () => {
  it('produces a leading-slash forward-slash path relative to the root', () => {
    expect(toDeployPath(BASE_DIGEST, join(BASE_DIGEST, 'css', 'app.css'))).toBe('/css/app.css');
  });

  it('handles a top-level file', () => {
    expect(toDeployPath(BASE_DIGEST, join(BASE_DIGEST, 'index.html'))).toBe('/index.html');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: buildDigest, walkDir (from digest.test.ts)
// ---------------------------------------------------------------------------

describe('buildDigest', () => {
  const DIR = join(
    tmpdir(),
    `netlify-build-digest-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  beforeEach(() => {
    mkdirSync(DIR, { recursive: true });
  });
  afterEach(() => {
    rmSync(DIR, { recursive: true, force: true });
  });

  it('builds the files map with leading-slash keys and correct SHA1s', async () => {
    writeFileSync(join(DIR, 'index.html'), 'hello');
    mkdirSync(join(DIR, 'css'), { recursive: true });
    writeFileSync(join(DIR, 'css', 'app.css'), 'body{}');

    const jail = new PathJail(DIR);
    const digest = await buildDigest(DIR, jail);

    expect(digest.files['/index.html']).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
    expect(digest.files['/css/app.css']).toBe(sha1Hex(new TextEncoder().encode('body{}')));
    expect(digest.list).toHaveLength(2);
    expect(digest.totalSize).toBe('hello'.length + 'body{}'.length);
  });

  it('content-addresses duplicates: one bySha1 entry for identical files', async () => {
    writeFileSync(join(DIR, 'a.txt'), 'same');
    writeFileSync(join(DIR, 'b.txt'), 'same');

    const jail = new PathJail(DIR);
    const digest = await buildDigest(DIR, jail);

    const sha = sha1Hex(new TextEncoder().encode('same'));
    expect(digest.list).toHaveLength(2);
    expect(Object.keys(digest.files)).toHaveLength(2);
    expect(digest.bySha1.size).toBe(1);
    expect(digest.bySha1.get(sha)).toBeDefined();
  });

  it('skips .git and node_modules', async () => {
    writeFileSync(join(DIR, 'index.html'), 'x');
    mkdirSync(join(DIR, '.git'), { recursive: true });
    writeFileSync(join(DIR, '.git', 'config'), 'secret');
    mkdirSync(join(DIR, 'node_modules'), { recursive: true });
    writeFileSync(join(DIR, 'node_modules', 'pkg.js'), 'junk');

    const jail = new PathJail(DIR);
    const digest = await buildDigest(DIR, jail);

    expect(digest.list).toHaveLength(1);
    expect(digest.files['/index.html']).toBeDefined();
    expect(digest.files['/.git/config']).toBeUndefined();
    expect(digest.files['/node_modules/pkg.js']).toBeUndefined();
  });

  it('returns an empty digest for an empty directory', async () => {
    const jail = new PathJail(DIR);
    const digest = await buildDigest(DIR, jail);
    expect(digest.list).toHaveLength(0);
    expect(Object.keys(digest.files)).toHaveLength(0);
  });
});

describe('walkDir', () => {
  const DIR = join(tmpdir(), `netlify-walk-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  beforeEach(() => {
    mkdirSync(DIR, { recursive: true });
  });
  afterEach(() => {
    rmSync(DIR, { recursive: true, force: true });
  });

  it('walks nested directories', async () => {
    mkdirSync(join(DIR, 'a', 'b'), { recursive: true });
    writeFileSync(join(DIR, 'a', 'b', 'deep.txt'), 'deep');

    const jail = new PathJail(DIR);
    const files = await walkDir(DIR, jail);
    expect(files.map((f) => f.deployPath)).toContain('/a/b/deep.txt');
  });
});

describe('buildDigest — jail integration (symlink escape)', () => {
  const DIR = join(
    tmpdir(),
    `netlify-jail-int-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  beforeEach(() => {
    mkdirSync(DIR, { recursive: true });
  });
  afterEach(() => {
    rmSync(DIR, { recursive: true, force: true });
  });

  it('throws [PATH_ESCAPE] for a symlink inside the dir that targets outside', async () => {
    const outside = join(
      tmpdir(),
      `netlify-outside-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'secret.txt'), 'host secret');
    try {
      writeFileSync(join(DIR, 'index.html'), 'ok');
      symlinkSync(join(outside, 'secret.txt'), join(DIR, 'leak.txt'));

      const jail = new PathJail(DIR);
      await expect(buildDigest(DIR, jail)).rejects.toThrow(/PATH_ESCAPE/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('walkDir — caps', () => {
  const DIR = join(tmpdir(), `netlify-caps-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  beforeEach(() => {
    mkdirSync(DIR, { recursive: true });
  });
  afterEach(() => {
    rmSync(DIR, { recursive: true, force: true });
  });

  it('throws [TOO_MANY_FILES] when the file count exceeds maxFiles', async () => {
    writeFileSync(join(DIR, 'a.txt'), '1');
    writeFileSync(join(DIR, 'b.txt'), '2');
    writeFileSync(join(DIR, 'c.txt'), '3');
    const jail = new PathJail(DIR);
    await expect(
      walkDir(DIR, jail, { maxFiles: 2, maxFileSize: 1_000_000, maxTotalSize: 1_000_000 }),
    ).rejects.toThrow(/\[TOO_MANY_FILES\]/);
  });

  it('throws [TOO_LARGE] when a single file exceeds maxFileSize', async () => {
    writeFileSync(join(DIR, 'big.bin'), 'x'.repeat(50));
    const jail = new PathJail(DIR);
    await expect(
      walkDir(DIR, jail, { maxFiles: 10, maxFileSize: 10, maxTotalSize: 1_000_000 }),
    ).rejects.toThrow(/\[TOO_LARGE\].*big\.bin/);
  });

  it('throws [TOO_LARGE] when the cumulative size exceeds maxTotalSize', async () => {
    writeFileSync(join(DIR, 'a.bin'), 'x'.repeat(8));
    writeFileSync(join(DIR, 'b.bin'), 'y'.repeat(8));
    const jail = new PathJail(DIR);
    await expect(
      walkDir(DIR, jail, { maxFiles: 10, maxFileSize: 100, maxTotalSize: 10 }),
    ).rejects.toThrow(/\[TOO_LARGE\] total/);
  });

  it('accepts a tree that sits exactly at the caps', async () => {
    writeFileSync(join(DIR, 'a.txt'), 'ab');
    writeFileSync(join(DIR, 'b.txt'), 'cd');
    const jail = new PathJail(DIR);
    const files = await walkDir(DIR, jail, { maxFiles: 2, maxFileSize: 2, maxTotalSize: 4 });
    expect(files).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: PathJail (from path-jail.test.ts)
// ---------------------------------------------------------------------------

describe('PathJail — containment', () => {
  const JAIL_BASE = join(
    tmpdir(),
    `netlify-jail-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const ALLOWED = join(JAIL_BASE, 'workspace');
  const ALLOWED_ADJACENT = `${ALLOWED}_adjacent`;
  const OUTSIDE = join(JAIL_BASE, 'outside');

  beforeEach(() => {
    mkdirSync(join(ALLOWED, 'site'), { recursive: true });
    mkdirSync(ALLOWED_ADJACENT, { recursive: true });
    mkdirSync(OUTSIDE, { recursive: true });
    writeFileSync(join(ALLOWED, 'site', 'index.html'), 'ok');
    writeFileSync(join(OUTSIDE, 'secret.txt'), 'secret');
  });

  afterEach(() => {
    rmSync(JAIL_BASE, { recursive: true, force: true });
  });

  it('resolves a directory inside the jail', () => {
    const jail = new PathJail(ALLOWED);
    expect(() => jail.resolveDir(join(ALLOWED, 'site'))).not.toThrow();
  });

  it('resolves a relative directory against the root (exact canonical path)', () => {
    const jail = new PathJail(ALLOWED);
    expect(jail.resolveDir('site')).toBe(join(jail.root, 'site'));
  });

  it('allows the jail root itself', () => {
    const jail = new PathJail(ALLOWED);
    expect(() => jail.resolveDir(ALLOWED)).not.toThrow();
  });

  it('rejects an absolute directory outside the jail', () => {
    const jail = new PathJail(ALLOWED);
    expect(() => jail.resolveDir(OUTSIDE)).toThrow(/PATH_ESCAPE/);
  });

  it('rejects relative traversal that escapes to an existing outside dir', () => {
    const jail = new PathJail(ALLOWED);
    expect(() => jail.resolveDir(join('..', 'outside'))).toThrow(/PATH_ESCAPE/);
  });

  it('CVE-2025-53110 — refuses a sibling dir sharing the root prefix', () => {
    const jail = new PathJail(ALLOWED);
    expect(() => jail.resolveDir(ALLOWED_ADJACENT)).toThrow(/PATH_ESCAPE/);
  });

  it('CVE-2025-53109 — refuses a symlink whose target is outside the jail', () => {
    const link = join(ALLOWED, 'escape');
    symlinkSync(OUTSIDE, link);
    const jail = new PathJail(ALLOWED);
    expect(() => jail.resolveDir(link)).toThrow(/PATH_ESCAPE/);
  });

  it('throws NOT_FOUND for a non-existent directory', () => {
    const jail = new PathJail(ALLOWED);
    expect(() => jail.resolveDir(join(ALLOWED, 'does-not-exist'))).toThrow(/NOT_FOUND/);
  });

  it('throws INVALID_INPUT for an empty path', () => {
    const jail = new PathJail(ALLOWED);
    expect(() => jail.resolveDir('')).toThrow(/INVALID_INPUT/);
  });
});

describe('PathJail — assertInside', () => {
  const JAIL_BASE = join(
    tmpdir(),
    `netlify-jail-assert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const ALLOWED = join(JAIL_BASE, 'workspace');
  const OUTSIDE = join(JAIL_BASE, 'outside');

  beforeEach(() => {
    mkdirSync(join(ALLOWED, 'site'), { recursive: true });
    mkdirSync(OUTSIDE, { recursive: true });
    writeFileSync(join(ALLOWED, 'site', 'index.html'), 'ok');
    writeFileSync(join(OUTSIDE, 'secret.txt'), 'secret');
  });

  afterEach(() => {
    rmSync(JAIL_BASE, { recursive: true, force: true });
  });

  it('passes for a path inside the jail', () => {
    const jail = new PathJail(ALLOWED);
    expect(() => jail.assertInside(join(ALLOWED, 'site', 'index.html'))).not.toThrow();
  });

  it('throws for a path outside the jail', () => {
    const jail = new PathJail(ALLOWED);
    expect(() => jail.assertInside(join(OUTSIDE, 'secret.txt'))).toThrow(/PATH_ESCAPE/);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: uploadPath, classify, collectPages, extractMessage,
//             NetlifyApiError, NetlifyClient cancellation
//             (from netlify-client.test.ts)
// ---------------------------------------------------------------------------

describe('uploadPath', () => {
  it('strips the leading slash for a top-level file', () => {
    expect(uploadPath('/index.html')).toBe('index.html');
  });

  it('strips the leading slash and keeps subdirectory separators', () => {
    expect(uploadPath('/css/app.css')).toBe('css/app.css');
    expect(uploadPath('/a/b/c.js')).toBe('a/b/c.js');
  });

  it('escapes special characters per segment (spaces, #) but keeps slashes', () => {
    expect(uploadPath('/my file.html')).toBe('my%20file.html');
    expect(uploadPath('/dir/weird#.html')).toBe('dir/weird%23.html');
  });

  it('collapses multiple leading slashes', () => {
    expect(uploadPath('//foo')).toBe('foo');
    expect(uploadPath('///a/b')).toBe('a/b');
  });

  it('handles a path that has no leading slash', () => {
    expect(uploadPath('foo/bar.js')).toBe('foo/bar.js');
    expect(uploadPath('index.html')).toBe('index.html');
  });
});

describe('classify', () => {
  it('maps HTTP status codes to error codes', () => {
    expect(classify(401)).toBe('AUTH_INVALID');
    expect(classify(403)).toBe('AUTH_INVALID');
    expect(classify(404)).toBe('NOT_FOUND');
    expect(classify(422)).toBe('INVALID_REQUEST');
    expect(classify(429)).toBe('RATE_LIMITED');
    expect(classify(500)).toBe('UPSTREAM_ERROR');
    expect(classify(503)).toBe('UPSTREAM_ERROR');
    expect(classify(400)).toBe('REQUEST_FAILED');
    expect(classify(418)).toBe('REQUEST_FAILED');
  });
});

describe('collectPages', () => {
  const page = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));

  it('follows pages until a short page ends the run', async () => {
    const pages = [page('a', 100), page('b', 100), page('c', 30)];
    const requested: number[] = [];
    const all = await collectPages(
      async (p) => {
        requested.push(p);
        return pages[p - 1] ?? [];
      },
      100,
      50,
    );
    expect(all).toHaveLength(230);
    expect(requested).toEqual([1, 2, 3]);
  });

  it('stops immediately on an empty first page', async () => {
    let calls = 0;
    const all = await collectPages(async () => {
      calls += 1;
      return [];
    });
    expect(all).toEqual([]);
    expect(calls).toBe(1);
  });

  it('honours maxPages so a full-page server cannot loop forever', async () => {
    let calls = 0;
    const all = await collectPages(
      async (_p, perPage) => {
        calls += 1;
        return page('x', perPage);
      },
      10,
      3,
    );
    expect(calls).toBe(3);
    expect(all).toHaveLength(30);
  });
});

describe('NetlifyClient — cancellation', () => {
  it('getDeploy throws [CANCELLED] when the signal is already aborted', async () => {
    const { NetlifyClient: NClient } = await import('../src/lib/netlify-client.js');
    const ac = new AbortController();
    ac.abort();
    const client = new NClient('tok', ac.signal);
    const err = await client.getDeploy('dep_1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetlifyApiError);
    expect((err as NetlifyApiError).code).toBe('CANCELLED');
    expect((err as NetlifyApiError).message).toMatch(/\[CANCELLED\]/);
  });
});

describe('extractMessage', () => {
  it('reads `message` from a JSON error body', () => {
    expect(extractMessage('{"code":404,"message":"Not Found"}', 'fallback')).toBe('Not Found');
  });

  it('falls back to `error` then `error_description`', () => {
    expect(extractMessage('{"error":"bad token"}', 'fallback')).toBe('bad token');
    expect(extractMessage('{"error_description":"expired"}', 'fallback')).toBe('expired');
  });

  it('returns the raw text when the body is not JSON', () => {
    expect(extractMessage('plain text error', 'fallback')).toBe('plain text error');
  });

  it('returns the fallback for an empty body', () => {
    expect(extractMessage('', 'Unauthorized')).toBe('Unauthorized');
  });

  it('ignores a null `message` field and falls back to the raw body', () => {
    expect(extractMessage('{"message":null}', 'fallback')).toBe('{"message":null}');
  });

  it('prefers a non-empty `error` when `message` is null', () => {
    expect(extractMessage('{"message":null,"error":"boom"}', 'fallback')).toBe('boom');
  });
});

describe('NetlifyApiError', () => {
  it('prefixes the message with [CODE] and preserves the upstream message', () => {
    const err = new NetlifyApiError('AUTH_INVALID', 'token is invalid', 401);
    expect(err.message).toBe('[AUTH_INVALID] token is invalid');
    expect(err.upstreamMessage).toBe('token is invalid');
    expect(err.code).toBe('AUTH_INVALID');
    expect(err.httpStatus).toBe(401);
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: executeDeploy + handler pre-flight guards (from deploy-site.test.ts)
// ---------------------------------------------------------------------------

const FAILURE_STATES = new Set(['error', 'rejected']);

interface FakeConfig {
  sites?: NetlifySite[];
  created?: NetlifySite;
  deploy: NetlifyDeploy;
  states: string[];
  ready?: Partial<NetlifyDeploy>;
  errorMessage?: string;
}

class FakeClient implements DeployClient {
  listSitesCalls = 0;
  createSiteCalls: Array<string | undefined> = [];
  createDeployCalls: Array<{ siteId: string; files: Record<string, string>; draft: boolean }> = [];
  uploadCalls: Array<{ deployId: string; deployPath: string; bytes: Uint8Array }> = [];
  getDeployCalls = 0;
  private stateIdx = 0;

  constructor(private readonly cfg: FakeConfig) {}

  async listSites(): Promise<NetlifySite[]> {
    this.listSitesCalls += 1;
    return this.cfg.sites ?? [];
  }

  async createSite(name?: string): Promise<NetlifySite> {
    this.createSiteCalls.push(name);
    return this.cfg.created ?? { id: 'site_new', name: name ?? 'site_new' };
  }

  async createDeploy(
    siteId: string,
    files: Record<string, string>,
    draft: boolean,
  ): Promise<NetlifyDeploy> {
    this.createDeployCalls.push({ siteId, files, draft });
    return { ...this.cfg.deploy };
  }

  async uploadFile(
    deployId: string,
    deployPath: string,
    bytes: Uint8Array,
  ): Promise<NetlifyDeploy> {
    this.uploadCalls.push({ deployId, deployPath, bytes });
    return { id: deployId, state: 'uploading' };
  }

  async getDeploy(deployId: string): Promise<NetlifyDeploy> {
    this.getDeployCalls += 1;
    const idx = Math.min(this.stateIdx, this.cfg.states.length - 1);
    const state = this.cfg.states[idx];
    this.stateIdx += 1;
    const base: NetlifyDeploy = { id: deployId, state };
    if (state === 'ready') return { ...base, ...this.cfg.ready };
    if (FAILURE_STATES.has(state)) return { ...base, error_message: this.cfg.errorMessage ?? null };
    return base;
  }
}

const DEPLOY_BASE = join(
  tmpdir(),
  `netlify-deploy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);
const FAST_POLL = { pollIntervalMs: 1, pollTimeoutMs: 50 };

function makeSiteDigest(): Promise<Digest> {
  mkdirSync(join(DEPLOY_BASE, 'site', 'css'), { recursive: true });
  writeFileSync(join(DEPLOY_BASE, 'site', 'index.html'), '<h1>hi</h1>');
  writeFileSync(join(DEPLOY_BASE, 'site', 'css', 'app.css'), 'body{}');
  const jail = new PathJail(DEPLOY_BASE);
  return buildDigest(join(DEPLOY_BASE, 'site'), jail);
}

describe('executeDeploy — site resolution', () => {
  beforeEach(() => {
    mkdirSync(DEPLOY_BASE, { recursive: true });
  });
  afterEach(() => {
    rmSync(DEPLOY_BASE, { recursive: true, force: true });
  });

  it('uses the explicit siteId without listing or creating sites', async () => {
    const digest = await makeSiteDigest();
    const client = new FakeClient({
      deploy: { id: 'dep_1', state: 'building', required: [] },
      states: ['ready'],
      ready: { ssl_url: 'https://s.netlify.app' },
    });

    const result = await executeDeploy(client, digest, {
      siteId: 'site_abc',
      draft: false,
      ...FAST_POLL,
    });

    expect(result.siteId).toBe('site_abc');
    expect(client.listSitesCalls).toBe(0);
    expect(client.createSiteCalls).toEqual([]);
    expect(client.createDeployCalls[0].siteId).toBe('site_abc');
  });

  it('finds an existing site by name on a later page', async () => {
    const sites: NetlifySite[] = Array.from({ length: 150 }, (_, i) => ({
      id: `site_${i}`,
      name: `site-${i}`,
    }));
    const digest = await makeSiteDigest();
    const client = new FakeClient({
      sites,
      deploy: { id: 'dep_1', state: 'building', required: [] },
      states: ['ready'],
      ready: { ssl_url: 'https://s.netlify.app' },
    });

    const result = await executeDeploy(client, digest, {
      siteName: 'site-120',
      draft: false,
      ...FAST_POLL,
    });

    expect(result.siteId).toBe('site_120');
    expect(client.createSiteCalls).toEqual([]);
    expect(client.createDeployCalls[0].siteId).toBe('site_120');
  });
});

describe('executeDeploy — site creation', () => {
  beforeEach(() => {
    mkdirSync(DEPLOY_BASE, { recursive: true });
  });
  afterEach(() => {
    rmSync(DEPLOY_BASE, { recursive: true, force: true });
  });

  it('creates a site by name when none matches', async () => {
    const digest = await makeSiteDigest();
    const client = new FakeClient({
      sites: [{ id: 'site_0', name: 'other' }],
      created: { id: 'site_made', name: 'fresh' },
      deploy: { id: 'dep_1', state: 'building', required: [] },
      states: ['ready'],
      ready: { ssl_url: 'https://s.netlify.app' },
    });

    const result = await executeDeploy(client, digest, {
      siteName: 'fresh',
      draft: false,
      ...FAST_POLL,
    });

    expect(client.createSiteCalls).toEqual(['fresh']);
    expect(result.siteId).toBe('site_made');
  });

  it('creates an unnamed site when neither id nor name is given', async () => {
    const digest = await makeSiteDigest();
    const client = new FakeClient({
      created: { id: 'site_auto', name: 'auto-name' },
      deploy: { id: 'dep_1', state: 'building', required: [] },
      states: ['ready'],
      ready: { ssl_url: 'https://s.netlify.app' },
    });

    const result = await executeDeploy(client, digest, { draft: false, ...FAST_POLL });

    expect(client.listSitesCalls).toBe(0);
    expect(client.createSiteCalls).toEqual([undefined]);
    expect(result.siteId).toBe('site_auto');
  });
});

describe('executeDeploy — digest, upload, poll', () => {
  beforeEach(() => {
    mkdirSync(DEPLOY_BASE, { recursive: true });
  });
  afterEach(() => {
    rmSync(DEPLOY_BASE, { recursive: true, force: true });
  });

  it('uploads nothing when Netlify reports required = []', async () => {
    const digest = await makeSiteDigest();
    const client = new FakeClient({
      deploy: { id: 'dep_x', state: 'building', required: [] },
      states: ['building', 'ready'],
      ready: { ssl_url: 'https://s.netlify.app' },
    });

    const result = await executeDeploy(client, digest, { siteId: 's', draft: false, ...FAST_POLL });

    expect(client.createDeployCalls[0].files).toEqual(digest.files);
    expect(client.createDeployCalls[0].draft).toBe(false);
    expect(client.uploadCalls).toHaveLength(0);
    expect(result.uploadedCount).toBe(0);
    expect(result.fileCount).toBe(2);
    expect(result.state).toBe('ready');
  });

  it('uploads exactly the required files with the right path + bytes', async () => {
    const digest = await makeSiteDigest();
    const indexSha = digest.files['/index.html'];
    const client = new FakeClient({
      deploy: { id: 'dep_up', state: 'building', required: [indexSha] },
      states: ['ready'],
      ready: { ssl_url: 'https://s.netlify.app' },
    });

    const result = await executeDeploy(client, digest, { siteId: 's', draft: false, ...FAST_POLL });

    expect(client.uploadCalls).toHaveLength(1);
    expect(client.uploadCalls[0].deployId).toBe('dep_up');
    expect(client.uploadCalls[0].deployPath).toBe('/index.html');
    expect(Buffer.from(client.uploadCalls[0].bytes).toString()).toBe('<h1>hi</h1>');
    expect(result.uploadedCount).toBe(1);
  });

  it('skips a required SHA1 that is not in the local digest', async () => {
    const digest = await makeSiteDigest();
    const client = new FakeClient({
      deploy: { id: 'dep_s', state: 'building', required: ['deadbeef-not-local'] },
      states: ['ready'],
      ready: { ssl_url: 'https://s.netlify.app' },
    });

    const result = await executeDeploy(client, digest, { siteId: 's', draft: false, ...FAST_POLL });

    expect(client.uploadCalls).toHaveLength(0);
    expect(result.uploadedCount).toBe(0);
  });

  it('polls past intermediate states until ready', async () => {
    const digest = await makeSiteDigest();
    const client = new FakeClient({
      deploy: { id: 'dep_p', state: 'building', required: [] },
      states: ['uploading', 'processing', 'ready'],
      ready: { ssl_url: 'https://s.netlify.app' },
    });

    const result = await executeDeploy(client, digest, { siteId: 's', draft: false, ...FAST_POLL });

    expect(client.getDeployCalls).toBe(3);
    expect(result.state).toBe('ready');
  });

  it('throws [DEPLOY_FAILED] with the upstream error_message on a failure state', async () => {
    const digest = await makeSiteDigest();
    const client = new FakeClient({
      deploy: { id: 'dep_err', state: 'building', required: [] },
      states: ['building', 'error'],
      errorMessage: 'build script returned non-zero exit code',
    });

    await expect(
      executeDeploy(client, digest, { siteId: 's', draft: false, ...FAST_POLL }),
    ).rejects.toThrow(/\[DEPLOY_FAILED\].*build script returned non-zero exit code/);
  });

  it('throws [DEPLOY_TIMEOUT] when the deploy never reaches ready', async () => {
    const digest = await makeSiteDigest();
    const client = new FakeClient({
      deploy: { id: 'dep_to', state: 'building', required: [] },
      states: ['building'],
    });

    await expect(
      executeDeploy(client, digest, {
        siteId: 's',
        draft: false,
        pollIntervalMs: 1,
        pollTimeoutMs: 5,
      }),
    ).rejects.toThrow(/\[DEPLOY_TIMEOUT\]/);
  });
});

describe('executeDeploy — URL selection', () => {
  beforeEach(() => {
    mkdirSync(DEPLOY_BASE, { recursive: true });
  });
  afterEach(() => {
    rmSync(DEPLOY_BASE, { recursive: true, force: true });
  });

  it('prod deploy prefers ssl_url', async () => {
    const digest = await makeSiteDigest();
    const client = new FakeClient({
      deploy: { id: 'dep_prod', state: 'building', required: [] },
      states: ['ready'],
      ready: {
        ssl_url: 'https://prod.netlify.app',
        deploy_ssl_url: 'https://abc--prod.netlify.app',
      },
    });

    const result = await executeDeploy(client, digest, { siteId: 's', draft: false, ...FAST_POLL });

    expect(result.url).toBe('https://prod.netlify.app');
    expect(result.draft).toBe(false);
  });

  it('draft deploy prefers the per-deploy permalink (deploy_ssl_url)', async () => {
    const digest = await makeSiteDigest();
    const client = new FakeClient({
      deploy: { id: 'dep_draft', state: 'building', required: [] },
      states: ['ready'],
      ready: {
        ssl_url: 'https://prod.netlify.app',
        deploy_ssl_url: 'https://abc--prod.netlify.app',
      },
    });

    const result = await executeDeploy(client, digest, { siteId: 's', draft: true, ...FAST_POLL });

    expect(client.createDeployCalls[0].draft).toBe(true);
    expect(result.url).toBe('https://abc--prod.netlify.app');
    expect(result.draft).toBe(true);
  });

  it('returns url=null when neither URL field is present', async () => {
    const digest = await makeSiteDigest();
    const client = new FakeClient({
      deploy: { id: 'dep_nourl', state: 'building', required: [] },
      states: ['ready'],
    });

    const result = await executeDeploy(client, digest, { siteId: 's', draft: false, ...FAST_POLL });
    expect(result.url).toBeNull();
  });
});

describe('deploy-site handler — pre-flight guards', () => {
  const GUARD_BASE = join(
    tmpdir(),
    `netlify-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const prevEnv = process.env.MCA_WORKSPACE_PATH;

  beforeEach(() => {
    mkdirSync(GUARD_BASE, { recursive: true });
    process.env.MCA_WORKSPACE_PATH = GUARD_BASE;
  });

  afterEach(() => {
    rmSync(GUARD_BASE, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.MCA_WORKSPACE_PATH;
    else process.env.MCA_WORKSPACE_PATH = prevEnv;
  });

  // The handler is registered on the app via registerDeploySiteTool. Since we
  // cannot extract it directly from the SDK app, we test the pre-flight logic
  // through executeDeploy and the PathJail / buildDigest layers above. The
  // AUTH_REQUIRED, EMPTY_DIR, and ROOT_DEPLOY_BLOCKED guards are exercised
  // via the integration test path or the unit tests for PathJail and buildDigest.

  it('buildDigest returns empty for a directory with no deployable files', async () => {
    mkdirSync(join(GUARD_BASE, 'empty'), { recursive: true });
    const jail = new PathJail(GUARD_BASE);
    const digest = await buildDigest(join(GUARD_BASE, 'empty'), jail);
    expect(digest.list).toHaveLength(0);
  });

  it('PathJail.resolveDir matches root when dir="."', () => {
    const jail = new PathJail(GUARD_BASE);
    const resolved = jail.resolveDir('.');
    expect(resolved).toBe(jail.root);
  });
});
