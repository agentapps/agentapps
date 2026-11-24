/**
 * StationServer HTTP route tests for app discovery, manifest serving,
 * launcher HTML, and static bundle serving.
 *
 * These routes are public (no auth required), consistent with /health.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryDataStore, InMemorySecretStore } from '../src/index.js';
import type { AppEntry } from '../src/server.js';
import { StationServer } from '../src/server.js';

/** Minimal factory that does nothing — sufficient for route tests. */
function noopFactory() {
  return () => {};
}

/** Create a temp directory with a sample static file for bundle tests. */
function makeTempAppDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'station-test-'));
  // Create a dist/ subdirectory with a sample JS bundle
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'screen.js'), 'console.log("hello from screen");');
  writeFileSync(join(dir, 'agentapp.json'), JSON.stringify({ id: 'app.test', version: '1.0.0' }));
  return dir;
}

const sampleManifest = {
  id: 'app.test',
  version: '1.0.0',
  name: 'Test App',
  description: 'A test application for route testing',
  screens: [
    {
      name: 'main',
      title: 'Main Screen',
      description: 'The main screen',
      launcher: true,
      bundleUrl: 'dist/screen.js',
    },
    {
      name: 'settings',
      title: 'Settings',
      launcher: false,
    },
  ],
};

describe('StationServer HTTP routes', () => {
  let server: StationServer | undefined;
  let baseUrl: string;
  let tempDir: string | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
    baseUrl = '';
    tempDir = undefined;
  });

  async function startServer(apps: AppEntry[]): Promise<string> {
    server = new StationServer({
      stationId: 'stn_test',
      workspaceId: 'ws_test',
      secretStore: new InMemorySecretStore(),
      dataStore: new InMemoryDataStore(),
      publicUrl: 'http://station.test',
      apps,
    });
    const info = await server.start(0, '127.0.0.1');
    return info.url;
  }

  // -------------------------------------------------------------------------
  // GET /apps
  // -------------------------------------------------------------------------

  it('GET /apps returns a JSON catalog of registered apps', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        name: 'Test App',
        description: 'A test app',
        manifest: sampleManifest,
      },
    ]);

    const resp = await fetch(`${baseUrl}/apps`);
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('application/json');

    const body = await resp.json();
    expect(body.stationId).toBeDefined();
    expect(body.apps).toHaveLength(1);
    expect(body.apps[0].id).toBe('app.test');
    expect(body.apps[0].version).toBe('1.0.0');
    expect(body.apps[0].name).toBe('Test App');
    expect(body.apps[0].description).toBe('A test app');
    expect(body.apps[0].manifestUrl).toBe('/apps/app.test/manifest');
  });

  it('GET /apps includes bundlesUrl when sourcePath is set', async () => {
    tempDir = makeTempAppDir();
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        manifest: sampleManifest,
        sourcePath: tempDir,
      },
    ]);

    const resp = await fetch(`${baseUrl}/apps`);
    const body = await resp.json();
    expect(body.apps[0].bundlesUrl).toBe('/apps/app.test/bundles');
  });

  it('GET /apps omits bundlesUrl when sourcePath is not set', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
      },
    ]);

    const resp = await fetch(`${baseUrl}/apps`);
    const body = await resp.json();
    expect(body.apps[0].bundlesUrl).toBeUndefined();
  });

  it('GET /apps returns empty array when no apps registered', async () => {
    baseUrl = await startServer([]);

    const resp = await fetch(`${baseUrl}/apps`);
    const body = await resp.json();
    expect(body.apps).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // GET /apps/:appId/manifest
  // -------------------------------------------------------------------------

  it('GET /apps/:appId/manifest returns the full manifest JSON', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        manifest: sampleManifest,
      },
    ]);

    const resp = await fetch(`${baseUrl}/apps/app.test/manifest`);
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('application/json');

    const body = await resp.json();
    expect(body.id).toBe('app.test');
    expect(body.version).toBe('1.0.0');
    expect(body.name).toBe('Test App');
    expect(body.screens).toHaveLength(2);
    expect(body.screens[0].name).toBe('main');
    expect(body.screens[0].launcher).toBe(true);
  });

  it('GET /apps/:appId/manifest returns 404 for unknown app', async () => {
    baseUrl = await startServer([]);

    const resp = await fetch(`${baseUrl}/apps/app.nonexistent/manifest`);
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error).toContain('App not found');
  });

  it('GET /apps/:appId/manifest returns 404 when manifest not provided', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
      },
    ]);

    const resp = await fetch(`${baseUrl}/apps/app.test/manifest`);
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error).toContain('No manifest available');
  });

  // -------------------------------------------------------------------------
  // GET /launcher
  // -------------------------------------------------------------------------

  it('GET /launcher returns HTML with app cards and launcher screen buttons', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        name: 'Test App',
        description: 'A test app',
        manifest: sampleManifest,
      },
    ]);

    const resp = await fetch(`${baseUrl}/launcher`);
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('text/html; charset=utf-8');

    const html = await resp.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Agent Apps Station');
    expect(html).toContain('Test App');
    expect(html).toContain('Main Screen');
    // The non-launcher screen should NOT have a button
    expect(html).not.toContain('Settings');
    // Manifest link should be present
    expect(html).toContain('/apps/app.test/manifest');
  });

  it('GET /launcher shows empty message when no apps registered', async () => {
    baseUrl = await startServer([]);

    const resp = await fetch(`${baseUrl}/launcher`);
    expect(resp.status).toBe(200);

    const html = await resp.text();
    expect(html).toContain('No apps registered');
  });

  it('GET /launcher resolves relative bundleUrls to station routes', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        manifest: sampleManifest,
      },
    ]);

    const resp = await fetch(`${baseUrl}/launcher`);
    const html = await resp.text();
    // The relative bundleUrl "dist/screen.js" should become a station route
    expect(html).toContain('/apps/app.test/bundles/dist/screen.js');
  });

  it('GET /launcher uses absolute bundleUrls as-is', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        manifest: {
          ...sampleManifest,
          screens: [
            {
              name: 'main',
              title: 'Main Screen',
              launcher: true,
              bundleUrl: 'https://cdn.example.com/bundles/screen.js',
            },
          ],
        },
      },
    ]);

    const resp = await fetch(`${baseUrl}/launcher`);
    const html = await resp.text();
    expect(html).toContain('https://cdn.example.com/bundles/screen.js');
  });

  it('GET /launcher escapes HTML in app names to prevent XSS', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        name: '<script>alert("xss")</script>',
        manifest: sampleManifest,
      },
    ]);

    const resp = await fetch(`${baseUrl}/launcher`);
    const html = await resp.text();
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('GET /launcher includes data-condition attributes on screen buttons', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        manifest: {
          ...sampleManifest,
          screens: [
            {
              name: 'main',
              title: 'Main Screen',
              launcher: true,
              bundleUrl: 'dist/screen.js',
              condition: 'authenticated',
            },
            {
              name: 'login',
              title: 'Login',
              launcher: true,
              bundleUrl: 'dist/login.js',
              condition: '!authenticated',
            },
          ],
        },
      },
    ]);

    const resp = await fetch(`${baseUrl}/launcher`);
    const html = await resp.text();
    expect(html).toContain('data-condition="authenticated"');
    expect(html).toContain('data-condition="!authenticated"');
  });

  it('GET /launcher embeds catalog JSON with screen conditions', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        manifest: {
          ...sampleManifest,
          screens: [
            {
              name: 'main',
              title: 'Main Screen',
              launcher: true,
              bundleUrl: 'dist/screen.js',
              condition: 'authenticated',
            },
          ],
        },
      },
    ]);

    const resp = await fetch(`${baseUrl}/launcher`);
    const html = await resp.text();
    // The catalog JSON should be embedded in a script tag
    expect(html).toContain('id="catalog-data"');
    expect(html).toContain('type="application/json"');
    // The JSON should contain the condition
    expect(html).toContain('"condition":"authenticated"');
  });

  it('GET /launcher includes iframe and auto-open JS for screen rendering', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        manifest: sampleManifest,
      },
    ]);

    const resp = await fetch(`${baseUrl}/launcher`);
    const html = await resp.text();
    // Iframe for rendering screens
    expect(html).toContain('id="screen-frame"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-forms allow-popups"');
    // Auto-open function
    expect(html).toContain('autoOpenFirstScreen');
    // Condition evaluation function
    expect(html).toContain('evaluateCondition');
    // Auth state toggle
    expect(html).toContain('id="auth-state"');
  });

  it('GET /launcher includes data-bundle-url attributes for iframe navigation', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        manifest: sampleManifest,
      },
    ]);

    const resp = await fetch(`${baseUrl}/launcher`);
    const html = await resp.text();
    expect(html).toContain('data-bundle-url=');
  });

  it('GET /launcher handles screens without bundleUrl gracefully', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        manifest: {
          ...sampleManifest,
          screens: [
            {
              name: 'main',
              title: 'Main Screen',
              launcher: true,
              // No bundleUrl — should be listed but not openable
            },
          ],
        },
      },
    ]);

    const resp = await fetch(`${baseUrl}/launcher`);
    const html = await resp.text();
    expect(html).toContain('Main Screen');
    // The button should have href="#" when no bundleUrl
    expect(html).toContain('href="#"');
  });

  // -------------------------------------------------------------------------
  // GET /apps/:appId/bundles/*
  // -------------------------------------------------------------------------

  it('GET /apps/:appId/bundles/* serves static files from sourcePath', async () => {
    tempDir = makeTempAppDir();
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        sourcePath: tempDir,
      },
    ]);

    const resp = await fetch(`${baseUrl}/apps/app.test/bundles/dist/screen.js`);
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('application/javascript; charset=utf-8');
    // Bundle URLs are unversioned (no content hash), so the server sends
    // `no-cache` to force revalidation and avoid serving stale bundles after a
    // rebuild.
    expect(resp.headers.get('cache-control')).toBe('no-cache');

    const body = await resp.text();
    expect(body).toBe('console.log("hello from screen");');
  });

  it('GET /apps/:appId/bundles/* returns 404 for unknown app', async () => {
    baseUrl = await startServer([]);

    const resp = await fetch(`${baseUrl}/apps/app.unknown/bundles/foo.js`);
    expect(resp.status).toBe(404);
  });

  it('GET /apps/:appId/bundles/* returns 404 when sourcePath not configured', async () => {
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
      },
    ]);

    const resp = await fetch(`${baseUrl}/apps/app.test/bundles/foo.js`);
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error).toContain('No source path');
  });

  it('GET /apps/:appId/bundles/* returns 404 for missing file', async () => {
    tempDir = makeTempAppDir();
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        sourcePath: tempDir,
      },
    ]);

    const resp = await fetch(`${baseUrl}/apps/app.test/bundles/nonexistent.js`);
    expect(resp.status).toBe(404);
  });

  it('GET /apps/:appId/bundles/* blocks path traversal with encoded ..', async () => {
    tempDir = makeTempAppDir();
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        sourcePath: tempDir,
      },
    ]);

    // Use URL-encoded path separators so fetch() doesn't normalize the ..
    // segments away before the request reaches the server.
    // %2F = /  →  ..%2F..%2F..%2Fetc%2Fpasswd decodes to ../../../etc/passwd
    const resp = await fetch(`${baseUrl}/apps/app.test/bundles/..%2F..%2F..%2Fetc%2Fpasswd`);
    expect(resp.status).toBe(403);
    const body = await resp.json();
    expect(body.error).toContain('Path traversal denied');
  });

  it('GET /apps/:appId/bundles/* serves SVG with correct MIME type', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'station-svg-'));
    writeFileSync(join(tempDir, 'icon.svg'), '<svg></svg>');
    baseUrl = await startServer([
      {
        id: 'app.test',
        version: '1.0.0',
        factory: noopFactory(),
        sourcePath: tempDir,
      },
    ]);

    const resp = await fetch(`${baseUrl}/apps/app.test/bundles/icon.svg`);
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('image/svg+xml');
  });

  // -------------------------------------------------------------------------
  // Auth bypass — these routes should NOT require authentication
  // -------------------------------------------------------------------------

  it('GET /apps works without auth even when token is configured', async () => {
    server = new StationServer({
      stationId: 'stn_test',
      workspaceId: 'ws_test',
      secretStore: new InMemorySecretStore(),
      dataStore: new InMemoryDataStore(),
      publicUrl: 'http://station.test',
      apps: [],
      token: 'secret-token',
    });
    const info = await server.start(0, '127.0.0.1');
    baseUrl = info.url;

    const resp = await fetch(`${baseUrl}/apps`);
    expect(resp.status).toBe(200);
  });

  it('GET /launcher works without auth even when token is configured', async () => {
    server = new StationServer({
      stationId: 'stn_test',
      workspaceId: 'ws_test',
      secretStore: new InMemorySecretStore(),
      dataStore: new InMemoryDataStore(),
      publicUrl: 'http://station.test',
      apps: [],
      token: 'secret-token',
    });
    const info = await server.start(0, '127.0.0.1');
    baseUrl = info.url;

    const resp = await fetch(`${baseUrl}/launcher`);
    expect(resp.status).toBe(200);
  });
});
