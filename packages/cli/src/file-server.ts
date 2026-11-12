/**
 * Static file server for the Files store.
 *
 * Serves public files over HTTP so that `publicUrl` values are real
 * HTTP URLs rather than `file://` paths. Designed as a standalone,
 * reusable module — the CLI uses it for local development; Agent Apps can
 * replace it with a CDN-backed implementation that exposes the same
 * `publicUrl(workspaceId, path)` interface.
 *
 * URL scheme: `GET /files/<workspaceId>/<path...>`
 *
 * Only files whose `.meta.json` sidecar has `"public": true` are served.
 * Content-Type is read from the sidecar's `contentType` field, falling
 * back to extension-based detection.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve } from 'node:path';

// -------------------------------------------------------------------------
// Extension → MIME map (covers the most common static assets)
// -------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.csv': 'text/csv',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.wasm': 'application/wasm',
};

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

export interface FileServerOptions {
  /** Port to listen on. Defaults to 0 (OS-assigned random port). */
  port?: number;
  /** Hostname to bind to. Defaults to `'127.0.0.1'`. */
  hostname?: string;
}

/**
 * Lightweight HTTP server that serves public files from the store.
 *
 * ```ts
 * const server = new FileServer('/path/to/.agentapps/store/files');
 * await server.start();
 * console.log(server.publicUrl('ws_abc', 'logo.png'));
 * // → http://127.0.0.1:54321/files/ws_abc/logo.png
 * ```
 */
export class FileServer {
  private readonly rootDir: string;
  private readonly preferredPort: number;
  private readonly hostname: string;
  private server: Server | null = null;
  private actualPort = 0;

  constructor(rootDir: string, options?: FileServerOptions) {
    this.rootDir = resolve(rootDir);
    this.preferredPort = options?.port ?? 0;
    this.hostname = options?.hostname ?? '127.0.0.1';
  }

  /** The port the server is listening on (0 if not started). */
  get port(): number {
    return this.actualPort;
  }

  /** Base URL of the running server, e.g. `http://127.0.0.1:54321`. */
  get baseUrl(): string {
    return `http://${this.hostname}:${this.actualPort}`;
  }

  /**
   * Build a public URL for a file.
   *
   * Workspace and path segments are percent-encoded so that the URL is
   * safe to embed in HTML, JSON, or wherever the app uses it.
   */
  publicUrl(workspaceId: string, path: string): string {
    const encodedWs = encodeURIComponent(workspaceId);
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return `${this.baseUrl}/files/${encodedWs}/${encodedPath}`;
  }

  /** Start the HTTP server. Idempotent — calling twice is a no-op. */
  async start(): Promise<void> {
    if (this.server) return;

    return new Promise<void>((resolvePromise, reject) => {
      const srv = createServer((req, res) => this.handleRequest(req, res));

      srv.on('error', reject);

      srv.listen(this.preferredPort, this.hostname, () => {
        const addr = srv.address();
        if (addr && typeof addr === 'object') {
          this.actualPort = addr.port;
        }
        this.server = srv;
        resolvePromise();
      });
    });
  }

  /** Stop the HTTP server. Idempotent. */
  async stop(): Promise<void> {
    if (!this.server) return;

    return new Promise<void>((resolvePromise) => {
      this.server?.closeAllConnections?.();
      this.server?.close(() => {
        this.server = null;
        this.actualPort = 0;
        resolvePromise();
      });
    });
  }

  // -----------------------------------------------------------------------
  // Request handler
  // -----------------------------------------------------------------------

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Only GET and HEAD are allowed.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    const rawUrl = req.url ?? '/';

    // Reject directory traversal early, before URL normalization removes it.
    // Check both literal `..` and percent-encoded variants (`%2e%2e`, `%2E%2E`).
    if (rawUrl.includes('..') || /%2e%2e/i.test(rawUrl)) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const url = new URL(rawUrl, `http://${this.hostname}`);
    const pathname = decodeURIComponent(url.pathname);

    // Expected: /files/<workspaceId>/<path...>
    const match = pathname.match(/^\/files\/([^/]+)\/(.+)$/);
    if (!match) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const [, workspaceId, filePath] = match;
    if (!workspaceId || !filePath) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const fullPath = resolve(this.rootDir, workspaceId, filePath);

    // Belt-and-suspenders: resolved path must stay inside rootDir.
    if (!fullPath.startsWith(this.rootDir)) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    if (!existsSync(fullPath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    // ---- Access control: only serve files marked public ----
    const metaPath = `${fullPath}.meta.json`;
    let contentType: string | undefined;
    let isPublic = false;

    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
        isPublic = meta.public === true;
        if (typeof meta.contentType === 'string') {
          contentType = meta.contentType;
        }
      } catch {
        // Corrupt meta → treat as non-public.
      }
    }

    if (!isPublic) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // ---- Determine content type ----
    if (!contentType) {
      const ext = extname(filePath).toLowerCase();
      contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    }

    // ---- Serve the file ----
    try {
      const stat = statSync(fullPath);
      const content = readFileSync(fullPath);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
      });

      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(content);
      }
    } catch {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
}
