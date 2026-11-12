/**
 * @agentapps/cli — FileServer tests
 *
 * Covers the static file server that serves public files over HTTP,
 * replacing file:// URLs with real HTTP URLs for local development.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileServer } from '../src/file-server.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'agentapps-file-server-'));
}

/** Write a file and its .meta.json sidecar. */
function writeFile(
  rootDir: string,
  workspaceId: string,
  filePath: string,
  content: string | Buffer,
  meta: { public?: boolean; contentType?: string } = {},
): void {
  const dir = join(rootDir, workspaceId);
  const fullDir = join(dir, ...filePath.split('/').slice(0, -1));
  mkdirSync(fullDir, { recursive: true });
  const fullPath = join(dir, filePath);
  writeFileSync(fullPath, content);
  writeFileSync(`${fullPath}.meta.json`, JSON.stringify(meta, null, 2), 'utf8');
}

describe('FileServer', () => {
  let tmpDir: string;
  let server: FileServer;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(async () => {
    await server?.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts on a random port and reports its base URL', async () => {
    server = new FileServer(tmpDir);
    await server.start();
    expect(server.port).toBeGreaterThan(0);
    expect(server.baseUrl).toBe(`http://127.0.0.1:${server.port}`);
  });

  it('stops cleanly and resets port', async () => {
    server = new FileServer(tmpDir);
    await server.start();
    const port = server.port;
    expect(port).toBeGreaterThan(0);
    await server.stop();
    expect(server.port).toBe(0);
  });

  it('start() is idempotent', async () => {
    server = new FileServer(tmpDir);
    await server.start();
    const port = server.port;
    await server.start(); // should not throw or change port
    expect(server.port).toBe(port);
  });

  it('stop() is idempotent', async () => {
    server = new FileServer(tmpDir);
    await server.start();
    await server.stop();
    await server.stop(); // should not throw
  });

  it('serves public files with 200', async () => {
    writeFile(tmpDir, 'ws1', 'hello.txt', 'Hello, world!', {
      public: true,
      contentType: 'text/plain',
    });
    server = new FileServer(tmpDir);
    await server.start();

    const res = await fetch(`${server.baseUrl}/files/ws1/hello.txt`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Hello, world!');
  });

  it('returns content-type from .meta.json sidecar', async () => {
    writeFile(tmpDir, 'ws1', 'data.bin', Buffer.from([1, 2, 3]), {
      public: true,
      contentType: 'application/octet-stream',
    });
    server = new FileServer(tmpDir);
    await server.start();

    const res = await fetch(`${server.baseUrl}/files/ws1/data.bin`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('falls back to extension-based content-type when meta has no contentType', async () => {
    writeFile(tmpDir, 'ws1', 'page.html', '<h1>Hi</h1>', { public: true });
    server = new FileServer(tmpDir);
    await server.start();

    const res = await fetch(`${server.baseUrl}/files/ws1/page.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
  });

  it('falls back to application/octet-stream for unknown extensions', async () => {
    writeFile(tmpDir, 'ws1', 'data.xyz', 'binary data', { public: true });
    server = new FileServer(tmpDir);
    await server.start();

    const res = await fetch(`${server.baseUrl}/files/ws1/data.xyz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('returns 403 for files not marked public', async () => {
    writeFile(tmpDir, 'ws1', 'secret.txt', 'private', { public: false });
    server = new FileServer(tmpDir);
    await server.start();

    const res = await fetch(`${server.baseUrl}/files/ws1/secret.txt`);
    expect(res.status).toBe(403);
  });

  it('returns 403 for files without .meta.json', async () => {
    mkdirSync(join(tmpDir, 'ws1'), { recursive: true });
    writeFileSync(join(tmpDir, 'ws1', 'bare.txt'), 'no meta');
    server = new FileServer(tmpDir);
    await server.start();

    const res = await fetch(`${server.baseUrl}/files/ws1/bare.txt`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent files', async () => {
    server = new FileServer(tmpDir);
    await server.start();

    const res = await fetch(`${server.baseUrl}/files/ws1/nope.txt`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for requests outside /files/ prefix', async () => {
    server = new FileServer(tmpDir);
    await server.start();

    const res = await fetch(`${server.baseUrl}/other/path`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for /files/ without workspace and path', async () => {
    server = new FileServer(tmpDir);
    await server.start();

    const res = await fetch(`${server.baseUrl}/files/`);
    expect(res.status).toBe(404);
  });

  it('rejects path traversal with 400', async () => {
    writeFile(tmpDir, 'ws1', 'legit.txt', 'ok', { public: true });
    server = new FileServer(tmpDir);
    await server.start();

    // Both fetch() and the URL constructor normalize `..` before sending,
    // so we use a raw HTTP request to test the server's traversal check.
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: '127.0.0.1',
          port: server.port,
          path: '/files/ws1/../ws1/legit.txt',
          method: 'GET',
        },
        (res) => resolve(res.statusCode ?? 0),
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(400);
  });

  it('handles HEAD requests', async () => {
    writeFile(tmpDir, 'ws1', 'hello.txt', 'Hello, world!', {
      public: true,
      contentType: 'text/plain',
    });
    server = new FileServer(tmpDir);
    await server.start();

    const res = await fetch(`${server.baseUrl}/files/ws1/hello.txt`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(res.headers.get('content-length')).toBe('13');
    const body = await res.text();
    expect(body).toBe('');
  });

  it('returns 405 for POST requests', async () => {
    server = new FileServer(tmpDir);
    await server.start();

    const res = await fetch(`${server.baseUrl}/files/ws1/hello.txt`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('serves nested file paths', async () => {
    writeFile(tmpDir, 'ws1', 'assets/images/logo.png', 'PNG-DATA', {
      public: true,
      contentType: 'image/png',
    });
    server = new FileServer(tmpDir);
    await server.start();

    const res = await fetch(`${server.baseUrl}/files/ws1/assets/images/logo.png`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('PNG-DATA');
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('generates correct publicUrl()', async () => {
    server = new FileServer(tmpDir);
    await server.start();
    const url = server.publicUrl('ws1', 'assets/logo.png');
    expect(url).toBe(`http://127.0.0.1:${server.port}/files/ws1/assets/logo.png`);
  });

  it('encodes workspace and path segments in publicUrl()', async () => {
    server = new FileServer(tmpDir);
    await server.start();
    const url = server.publicUrl('my workspace', 'path with spaces/file.txt');
    expect(url).toBe(
      `http://127.0.0.1:${server.port}/files/my%20workspace/path%20with%20spaces/file.txt`,
    );
  });

  it('listens on a specific port when configured', async () => {
    // Find a free port by binding to 0 first, then using that port
    const probe = new FileServer(tmpDir, { port: 0 });
    await probe.start();
    const freePort = probe.port;
    await probe.stop();

    server = new FileServer(tmpDir, { port: freePort });
    await server.start();
    expect(server.port).toBe(freePort);
  });
});
