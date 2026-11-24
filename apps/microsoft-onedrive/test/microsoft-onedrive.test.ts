/**
 * Tests for the Microsoft OneDrive Agent App.
 *
 * Mocks the Microsoft Graph API so tests run without real credentials.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  safeParseAppManifest,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, factory } from '../src/app.js';
import { createGraphClient } from '../src/lib/graph-client.js';

// ESM has no __dirname; derive it the way packages/station/test does.
const __dirname = dirname(fileURLToPath(import.meta.url));

let appStation: AppStation;
let host: Transport;
let received: MessageBase[];
let systemSecrets: Record<string, string>;
let installationSecrets: Record<string, string>;
/** Records every update_installation_secrets payload the app sends. */
let updatedSecrets: Array<Record<string, string>>;

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
    host: { name: 'test', version: '1.0.3' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitForType('initialized');

  received.length = 0;
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'inst_onedrive',
    tenant: { userId: 'u_test' },
  } as MessageBase);
  const opened = await waitForType('session_opened');
  received.length = 0;
  return opened.sessionId as string;
}

function sendToolCall(sessionId: string, tool: string, args: Record<string, unknown>): void {
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool,
    arguments: args,
    context: { userId: 'u_test', installationId: 'inst_onedrive' },
  } as MessageBase);
}

/** Builds a fetch mock response with a JSON body. */
function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
  };
}

beforeEach(() => {
  systemSecrets = {
    CLIENT_ID: 'test-client-id',
    CLIENT_SECRET: 'test-client-secret',
  };
  installationSecrets = {
    ACCESS_TOKEN: 'test-access-token',
    REFRESH_TOKEN: 'test-refresh-token',
    EMAIL: 'user@outlook.com',
    EXPIRY_DATE: new Date(Date.now() + 3600_000).toISOString(),
  };
  updatedSecrets = [];

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.microsoft.onedrive',
    appVersion: '1.1.0',
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

    if (type === 'get_system_secrets') {
      host.send({
        ...createEnvelope('system_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: systemSecrets,
      } as MessageBase);
    }

    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: installationSecrets,
      } as MessageBase);
    }

    // The app persists refreshed tokens through this callback (deviation 1).
    if (type === 'update_installation_secrets') {
      updatedSecrets.push(m.secrets as Record<string, string>);
      Object.assign(installationSecrets, m.secrets as Record<string, string>);
      host.send({
        ...createEnvelope('update_installation_secrets_response', sessionId),
        id: requestId,
        requestId,
        success: true,
      } as MessageBase);
    }
  });

  appStation.accept(ctrlSide);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await appStation.shutdown();
});

describe('Microsoft OneDrive Agent App', () => {
  it('has a manifest that passes the protocol schema', () => {
    const manifestPath = join(__dirname, '..', 'agentapp.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    const result = safeParseAppManifest(manifest);

    expect(result.success).toBe(true);
    expect(manifest.id).toBe('app.microsoft.onedrive');
    expect(manifest.version).toBe('1.1.0');
    expect(manifest.auth.scopes).toContain('Files.ReadWrite.All');
    expect(manifest.auth.scopes).toContain('Sites.Read.All');
  });

  it('keeps agentapp.json in sync with the createApp() config it was built from', () => {
    // agentapp.json and src/app.ts both describe this app by hand, and
    // nothing enforces that a field edited in one is also edited in the
    // other. `app.toManifest()` is the SDK's own generator for agentapp.json
    // (the same method `build()` uses to write it) — comparing its output
    // against the checked-in file catches drift between the two at the
    // source, rather than trusting a human to keep them matched.
    //
    // A hand-maintained field list only catches whatever fields someone
    // remembered to list — it already missed `entrypoint` and `tagline`
    // once. Compare the whole parsed object instead, so the next field
    // added to either side is covered automatically. Both sides are run
    // through `safeParseAppManifest` first, so schema-applied defaults
    // (e.g. `capabilities.events: false`) land on both and don't register
    // as false-positive drift.
    const manifestPath = join(__dirname, '..', 'agentapp.json');
    const checkedInRaw = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const checkedInResult = safeParseAppManifest(checkedInRaw);
    const generatedResult = safeParseAppManifest(app.toManifest());

    expect(checkedInResult.success).toBe(true);
    expect(generatedResult.success).toBe(true);
    if (!checkedInResult.success || !generatedResult.success) return;

    expect(generatedResult.data).toEqual(checkedInResult.data);
  });

  it('registers all 20 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'convert-file',
      'copy-item',
      'create-folder',
      'create-share-link',
      'delete-item',
      'download-file',
      'get-drive-info',
      'get-file-content',
      'get-item',
      'invite-people',
      'list-items',
      'list-permissions',
      'list-recent',
      'list-shared-with-me',
      'list-versions',
      'move-item',
      'remove-permission',
      'rename-item',
      'search-items',
      'upload-file',
    ]);
  });

  it('list-items returns formatted children of the drive root', async () => {
    const children = {
      value: [
        {
          id: 'item-1',
          name: 'Reports',
          folder: { childCount: 3 },
          size: 0,
          createdDateTime: '2026-08-01T10:00:00Z',
          lastModifiedDateTime: '2026-08-02T11:00:00Z',
          webUrl: 'https://onedrive.live.com/reports',
          parentReference: { id: 'root', path: '/drive/root:' },
        },
        {
          id: 'item-2',
          name: 'budget.xlsx',
          file: {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          size: 20480,
          createdDateTime: '2026-08-03T09:00:00Z',
          lastModifiedDateTime: '2026-08-04T09:00:00Z',
          webUrl: 'https://onedrive.live.com/budget',
          parentReference: { id: 'root', path: '/drive/root:' },
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(children));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-items', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.account).toBe('user@outlook.com');
    expect(data.count).toBe(2);

    const items = data.items as Array<Record<string, unknown>>;
    expect(items[0].name).toBe('Reports');
    expect(items[0].type).toBe('folder');
    expect(items[0].childCount).toBe(3);
    expect(items[1].name).toBe('budget.xlsx');
    expect(items[1].type).toBe('file');
    expect(items[1].size).toBe(20480);
  });

  it('list-items addresses a folder by path when given one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-items', { path: 'Documents/Reports' });

    await waitForType('tool_result');

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/children'),
    );
    expect(call).toBeDefined();
    expect(call![0]).toContain('/me/drive/root:/Documents/Reports:/children');
  });

  it('get-item returns a single formatted item by id', async () => {
    const item = {
      id: 'item-9',
      name: 'notes.txt',
      file: { mimeType: 'text/plain' },
      size: 128,
      createdDateTime: '2026-08-05T10:00:00Z',
      lastModifiedDateTime: '2026-08-05T12:00:00Z',
      webUrl: 'https://onedrive.live.com/notes',
      parentReference: { id: 'root', path: '/drive/root:' },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(item)));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-item', { itemId: 'item-9' });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;
    const returned = data.item as Record<string, unknown>;

    expect(returned.id).toBe('item-9');
    expect(returned.name).toBe('notes.txt');
    expect(returned.mimeType).toBe('text/plain');
  });

  it('search-items passes the query to the Graph search endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ value: [{ id: 'hit-1', name: 'invoice.pdf', file: {} }] }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'search-items', { query: 'invoice' });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;

    expect(data.query).toBe('invoice');
    expect(data.count).toBe(1);

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('search'),
    );
    expect(call![0]).toContain("/me/drive/root/search(q='invoice')");
  });

  it('download-file writes the file to the given output directory', async () => {
    const { mkdtempSync, readFileSync: readBack } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const outputPath = mkdtempSync(join(tmpdir(), 'onedrive-test-'));

    const fileBytes = Buffer.from('hello onedrive', 'utf-8');
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/content')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(new Uint8Array(fileBytes).buffer),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
          headers: new Headers({ 'content-type': 'application/octet-stream' }),
        });
      }
      return Promise.resolve(
        jsonResponse({ id: 'item-1', name: 'hello.txt', size: fileBytes.length, file: {} }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'download-file', { itemId: 'item-1', outputPath });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.name).toBe('hello.txt');
    expect(readBack(data.savedTo as string).length).toBe(fileBytes.length);
  });

  it('download-file selects the folder facet so folders can be detected', async () => {
    // $select is a genuine field projection: unless 'folder' is requested,
    // Graph omits it from the response even for an actual folder, and the
    // meta.folder guard silently never fires. Assert on the outgoing
    // request's query string, since the mock's response body would return
    // the same JSON either way and cannot prove the projection was correct.
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/content')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
          headers: new Headers({ 'content-type': 'application/octet-stream' }),
        });
      }
      return Promise.resolve(jsonResponse({ id: 'item-1', name: 'hello.txt', size: 0, file: {} }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const outputPath = mkdtempSync(join(tmpdir(), 'onedrive-test-'));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'download-file', { itemId: 'item-1', outputPath });

    await waitForType('tool_result');

    const metaCall = fetchMock.mock.calls.find(
      (c: any[]) =>
        typeof c[0] === 'string' && c[0].includes('$select') && !c[0].includes('/content'),
    );
    expect(metaCall).toBeDefined();
    expect(metaCall![0]).toContain('folder');
  });

  it('download-file refuses files above the 50 MB ceiling', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ id: 'big', name: 'big.zip', size: 60 * 1024 * 1024, file: {} }),
        ),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'download-file', { itemId: 'big' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('50 MB');
  });

  it('get-file-content returns text inline', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/content')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: () =>
            Promise.resolve(new Uint8Array(Buffer.from('line one\nline two')).buffer),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve('line one\nline two'),
          headers: new Headers({ 'content-type': 'text/plain' }),
        });
      }
      return Promise.resolve(
        jsonResponse({
          id: 'item-2',
          name: 'notes.txt',
          size: 17,
          file: { mimeType: 'text/plain' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-file-content', { itemId: 'item-2' });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;

    expect(data.content).toContain('line one');
    expect(data.name).toBe('notes.txt');
  });

  it('get-file-content refuses binary content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          id: 'item-3',
          name: 'report.docx',
          size: 2048,
          file: {
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        }),
      ),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-file-content', { itemId: 'item-3' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('is not text');
    expect(error.message as string).toContain('download-file');
  });

  it('convert-file requests the PDF rendition', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const outputPath = mkdtempSync(join(tmpdir(), 'onedrive-pdf-'));

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('format=pdf')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(new Uint8Array(Buffer.from('%PDF-1.7')).buffer),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
          headers: new Headers({ 'content-type': 'application/pdf' }),
        });
      }
      return Promise.resolve(
        jsonResponse({ id: 'doc-1', name: 'report.docx', size: 4096, file: {} }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'convert-file', { itemId: 'doc-1', outputPath });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.savedTo as string).toContain('report.pdf');

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('format=pdf'),
    );
    expect(call).toBeDefined();
  });

  it('upload-file uses a simple PUT for small files', async () => {
    const { mkdtempSync, writeFileSync: write } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'onedrive-up-'));
    const localPath = join(dir, 'small.txt');
    write(localPath, 'small payload');

    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'new-1', name: 'small.txt', size: 13, file: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'upload-file', { localPath, destinationPath: 'Documents' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const uploadCall = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes(':/content'),
    );
    expect(uploadCall).toBeDefined();
    expect(uploadCall![1].method).toBe('PUT');
    expect(uploadCall![0]).toContain('/me/drive/root:/Documents/small.txt:/content');
    // No upload session is created for a small file.
    expect(
      fetchMock.mock.calls.some(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('createUploadSession'),
      ),
    ).toBe(false);
  });

  it('upload-file creates an upload session for files at or above 4 MB, chunked to tile the file exactly', async () => {
    const { mkdtempSync, writeFileSync: write } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'onedrive-big-'));
    const localPath = join(dir, 'big.bin');
    const size = 5 * 1024 * 1024;
    write(localPath, Buffer.alloc(size, 1));

    // Chunk size the tool is expected to use: a multiple of 320 KiB.
    const CHUNK_SIZE = 5 * 320 * 1024;

    // Records every chunk PUT's Content-Range so the test can assert on the
    // real chunk arithmetic, not just "some upload session was created".
    const chunkPuts: Array<{ start: number; end: number; total: number }> = [];

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('createUploadSession')) {
        return Promise.resolve(
          jsonResponse({ uploadUrl: 'https://upload.example/session-1', expirationDateTime: '' }),
        );
      }
      if (typeof url === 'string' && url.startsWith('https://upload.example/')) {
        const headers = init?.headers as Record<string, string>;
        const match = /bytes (\d+)-(\d+)\/(\d+)/.exec(headers['Content-Range']);
        if (!match) {
          throw new Error(
            `Chunk PUT is missing a Content-Range header: ${JSON.stringify(headers)}`,
          );
        }
        const start = Number(match[1]);
        const end = Number(match[2]);
        const total = Number(match[3]);
        chunkPuts.push({ start, end, total });

        // Only the final chunk (the one reaching the last byte) returns the
        // created item with a 2xx-complete status; every other chunk is 202.
        const isFinalChunk = end === total - 1;
        return Promise.resolve(
          isFinalChunk
            ? jsonResponse({ id: 'new-2', name: 'big.bin', size: total, file: {} }, 201)
            : jsonResponse({}, 202),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'upload-file', { localPath, destinationPath: 'Documents' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect((data.item as Record<string, unknown>).name).toBe('big.bin');
    expect(
      fetchMock.mock.calls.some(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('createUploadSession'),
      ),
    ).toBe(true);

    // The chunk count matches the expected chunk size exactly (an
    // implementation that PUT the whole file in one request, or that
    // mis-sized a chunk, would fail this).
    expect(chunkPuts.length).toBe(Math.ceil(size / CHUNK_SIZE));

    // Ranges tile 0 -> size-1 contiguously, with no gap or overlap, and the
    // advertised total always matches the real file size.
    let expectedStart = 0;
    for (const put of chunkPuts) {
      expect(put.start).toBe(expectedStart);
      expect(put.total).toBe(size);
      expectedStart = put.end + 1;
    }
    expect(expectedStart).toBe(size);
    expect(chunkPuts[chunkPuts.length - 1].end).toBe(size - 1);
  });

  it('upload-file reports a clear error when the local file is missing', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'upload-file', { localPath: '/nonexistent/nope.txt' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('not found');
  });

  it('health check reports ready when tokens are valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ id: 'drive-1', driveType: 'personal' })),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('health check reports degraded when credentials are missing', async () => {
    systemSecrets = {};
    installationSecrets = {};

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
  });

  it('persists refreshed tokens through updateInstallation when the access token is expired', async () => {
    // Expired token forces a refresh on the next client construction.
    installationSecrets.EXPIRY_DATE = new Date(Date.now() - 60_000).toISOString();

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/oauth2/v2.0/token')) {
        return Promise.resolve(
          jsonResponse({
            access_token: 'refreshed-access-token',
            refresh_token: 'refreshed-refresh-token',
            expires_in: 60,
          }),
        );
      }
      return Promise.resolve(jsonResponse({ id: 'drive-1', driveType: 'personal' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    await waitForType('health_status');

    expect(updatedSecrets.length).toBeGreaterThan(0);
    const persisted = updatedSecrets[0];
    expect(persisted.ACCESS_TOKEN).toBe('refreshed-access-token');
    expect(persisted.REFRESH_TOKEN).toBe('refreshed-refresh-token');
    // EXPIRY_DATE is derived from expires_in (60s here), which Outlook's client
    // ignores in favor of a hardcoded 3600s — assert the narrow window so a
    // regression to that fallback would fail this test.
    const expiryMs = new Date(persisted.EXPIRY_DATE).getTime();
    expect(expiryMs).toBeGreaterThan(Date.now());
    expect(expiryMs).toBeLessThan(Date.now() + 120_000);
  });

  it('never includes the access token in error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'InvalidAuthenticationToken',
              message: 'Access token is expired.',
              innerError: { 'request-id': 'req-abc-123' },
            },
          },
          401,
        ),
      ),
    );

    const sessionId = await initAndOpen();
    received.length = 0;

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
    expect(JSON.stringify(health)).not.toContain('test-access-token');
  });

  it('retries a throttled GET and returns the eventual success', async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve(
          jsonResponse({ error: { code: 'activityLimitReached' } }, 429, {
            'retry-after': '0',
          }),
        );
      }
      return Promise.resolve(jsonResponse({ id: 'drive-1', driveType: 'personal' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    // Session open performs no Graph calls today; reset so a future task that
    // adds one there cannot silently shift this count.
    calls = 0;

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
    expect(calls).toBe(2);
  });

  it('refreshes and replays once when Graph answers 401 mid-flight', async () => {
    // Suite spec §8.1 row 1. EXPIRY_DATE is still valid here, so the proactive
    // refresh does not fire — only the reactive one can rescue this call.
    let graphCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/oauth2/v2.0/token')) {
        return Promise.resolve(
          jsonResponse({
            access_token: 'reactive-access-token',
            refresh_token: 'reactive-refresh-token',
            expires_in: 3600,
          }),
        );
      }
      graphCalls += 1;
      if (graphCalls === 1) {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                code: 'InvalidAuthenticationToken',
                message: 'Access token is expired.',
              },
            },
            401,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ id: 'item-9', name: 'notes.txt', file: {} }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    graphCalls = 0;
    received.length = 0;
    sendToolCall(sessionId, 'get-item', { itemId: 'item-9' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    expect((result.result as Record<string, unknown>).item).toMatchObject({ name: 'notes.txt' });

    // One rejected attempt plus one replay.
    expect(graphCalls).toBe(2);
    expect(updatedSecrets.some((s) => s.ACCESS_TOKEN === 'reactive-access-token')).toBe(true);

    // The replay carried the refreshed token, not the rejected one.
    const graphRequests = fetchMock.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/me/drive/items/item-9'),
    );
    expect(graphRequests.length).toBe(2);
    expect(graphRequests[0][1].headers.Authorization).toBe('Bearer test-access-token');
    expect(graphRequests[1][1].headers.Authorization).toBe('Bearer reactive-access-token');
  });

  it('tells the user to reconnect when a 401 survives the refresh', async () => {
    // Suite spec §8.1 row 2: the one auth failure that means "reconnect".
    let graphCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/oauth2/v2.0/token')) {
        return Promise.resolve(
          jsonResponse({ access_token: 'still-rejected-token', expires_in: 3600 }),
        );
      }
      graphCalls += 1;
      return Promise.resolve(
        jsonResponse(
          { error: { code: 'InvalidAuthenticationToken', message: 'Access token is expired.' } },
          401,
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    graphCalls = 0;
    received.length = 0;
    sendToolCall(sessionId, 'get-item', { itemId: 'item-9' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('reconnect your Microsoft account');
    // Not the generic Graph error the client used to surface here.
    expect(error.message as string).not.toContain('InvalidAuthenticationToken');
    expect(JSON.stringify(result)).not.toContain('test-access-token');

    // Exactly one refresh-and-replay: no 401 loop.
    expect(graphCalls).toBe(2);
    expect(
      fetchMock.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('/oauth2/v2.0/token'),
      ).length,
    ).toBe(1);
  });

  it('reports the reconnect message when the refresh itself fails on a 401', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/oauth2/v2.0/token')) {
        return Promise.resolve(jsonResponse({ error: 'invalid_grant' }, 400));
      }
      return Promise.resolve(
        jsonResponse(
          { error: { code: 'InvalidAuthenticationToken', message: 'Access token is expired.' } },
          401,
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-item', { itemId: 'item-9' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('reconnect your Microsoft account');
  });

  it('gives up after 3 attempts on sustained throttling', async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      calls += 1;
      return Promise.resolve(
        jsonResponse({ error: { code: 'activityLimitReached', message: 'Throttled.' } }, 429, {
          'retry-after': '0',
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    // Session open performs no Graph calls today; reset so a future task that
    // adds one there cannot silently shift this count.
    calls = 0;

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
    expect(calls).toBe(3);
  });

  it('create-folder posts a folder facet to the parent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'f-1', name: 'Reports', folder: { childCount: 0 } }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-folder', { name: 'Reports' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/children'),
    );
    expect(call![1].method).toBe('POST');
    const body = JSON.parse(call![1].body);
    expect(body.name).toBe('Reports');
    expect(body.folder).toEqual({});
  });

  it('does not retry a throttled POST', async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      calls += 1;
      return Promise.resolve(
        jsonResponse({ error: { code: 'activityLimitReached', message: 'Throttled.' } }, 429, {
          'retry-after': '0',
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    // Session open performs no Graph calls today; reset so a future task that
    // adds one there cannot silently shift this count.
    calls = 0;
    received.length = 0;
    sendToolCall(sessionId, 'create-folder', { name: 'Reports' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    // Exactly one attempt: retrying a POST could create a duplicate folder.
    expect(calls).toBe(1);
  });

  it('move-item patches the parent reference', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'item-1', name: 'a.txt', file: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'move-item', { itemId: 'item-1', destinationFolderId: 'f-2' });

    await waitForType('tool_result');

    const call = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'PATCH');
    expect(call).toBeDefined();
    const body = JSON.parse(call![1].body);
    expect(body.parentReference.id).toBe('f-2');
  });

  it('rename-item patches the name', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'item-1', name: 'renamed.txt', file: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'rename-item', { itemId: 'item-1', newName: 'renamed.txt' });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;
    expect((data.item as Record<string, unknown>).name).toBe('renamed.txt');

    const call = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'PATCH');
    expect(JSON.parse(call![1].body).name).toBe('renamed.txt');
  });

  it('delete-item issues a DELETE and reports success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve(null),
      text: () => Promise.resolve(''),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'delete-item', { itemId: 'item-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);

    const call = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'DELETE');
    expect(call![0]).toContain('/me/drive/items/item-1');
  });

  it('delete-item percent-encodes the path so a "#" cannot retarget the request', async () => {
    // Unencoded, `Reports/2026#final.xlsx` becomes a URL fragment: fetch strips
    // everything from `#` onward and DELETEs `/me/drive/root:/Reports` instead
    // — the wrong item, recursively, reported as success.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve(null),
      text: () => Promise.resolve(''),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'delete-item', { path: 'Reports/2026#final.xlsx' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'DELETE');
    expect(call).toBeDefined();
    expect(call![0]).toBe(
      'https://graph.microsoft.com/v1.0/me/drive/root:/Reports/2026%23final.xlsx:',
    );
    // The separators survive; only the segment contents are encoded.
    expect(call![0]).not.toContain('#');
  });

  it('delete-item refuses a call with neither itemId nor path', async () => {
    // Nothing validates arguments at runtime, so a typo'd name would otherwise
    // fall through to itemRef's drive-root default.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'delete-item', { itmeId: 'item-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('Specify itemId or path.');

    // The drive root was never touched.
    expect(fetchMock.mock.calls.some((c: any[]) => c[1]?.method === 'DELETE')).toBe(false);
  });

  it('move-item builds an encoded parentReference path from destinationPath', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'item-1', name: 'a.txt', file: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'move-item', {
      itemId: 'item-1',
      destinationPath: 'Archive/Q3 #2',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'PATCH');
    expect(call).toBeDefined();
    const body = JSON.parse(call![1].body);
    // Graph itself emits percent-encoded values in parentReference.path.
    expect(body.parentReference).toEqual({ path: '/drive/root:/Archive/Q3%20%232' });
  });

  it('create-folder creates inside the folder named by parentPath', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'f-2', name: 'Q3', folder: { childCount: 0 } }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-folder', { name: 'Q3', parentPath: 'Documents/Reports' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/children'),
    );
    expect(call).toBeDefined();
    expect(call![0]).toContain('/me/drive/root:/Documents/Reports:/children');
    expect(JSON.parse(call![1].body).name).toBe('Q3');
  });

  it('create-folder still accepts the legacy itemId alias for the parent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'f-3', name: 'Q4', folder: { childCount: 0 } }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-folder', { name: 'Q4', itemId: 'parent-1' });

    await waitForType('tool_result');

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/children'),
    );
    expect(call![0]).toContain('/me/drive/items/parent-1/children');
  });

  it('convert-file refuses a folder and never fetches the rendition', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'folder-1', name: 'Reports', folder: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'convert-file', { itemId: 'folder-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('is a folder');

    // The folder facet is a real $select projection: without it the guard above
    // can never fire, because Graph omits the field.
    const metaCall = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('$select'),
    );
    expect(metaCall).toBeDefined();
    expect(metaCall![0]).toContain('folder');

    expect(
      fetchMock.mock.calls.some(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('format=pdf'),
      ),
    ).toBe(false);
  });

  it('convert-file refuses files above the 50 MB ceiling', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: 'big', name: 'big.docx', size: 60 * 1024 * 1024, file: {} }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'convert-file', { itemId: 'big' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('50 MB');
    expect(
      fetchMock.mock.calls.some(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('format=pdf'),
      ),
    ).toBe(false);
  });

  it('copy-item polls the monitor URL until the copy completes', async () => {
    let monitorCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.endsWith('/copy')) {
        return Promise.resolve({
          ok: true,
          status: 202,
          json: () => Promise.resolve(null),
          text: () => Promise.resolve(''),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          headers: new Headers({ location: 'https://monitor.example/op-1' }),
        });
      }
      if (typeof url === 'string' && url.startsWith('https://monitor.example/')) {
        monitorCalls += 1;
        const body =
          monitorCalls === 1
            ? { status: 'inProgress', percentageComplete: 40 }
            : { status: 'completed', resourceId: 'copy-1' };
        return Promise.resolve(jsonResponse(body));
      }
      return Promise.resolve(jsonResponse({ id: 'copy-1', name: 'a-copy.txt', file: {} }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'copy-item', {
      itemId: 'item-1',
      destinationFolderId: 'f-2',
      newName: 'a-copy.txt',
      pollIntervalMs: 0,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.status).toBe('completed');
    expect((data.item as Record<string, unknown>).name).toBe('a-copy.txt');
    expect(monitorCalls).toBe(2);

    // The copy must be started against the right item, with the right destination and name.
    const postCall = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(postCall![0]).toContain('/me/drive/items/item-1/copy');
    const postBody = JSON.parse(postCall![1].body);
    expect(postBody.parentReference).toEqual({ id: 'f-2' });
    expect(postBody.name).toBe('a-copy.txt');

    // The monitor URL is off graph.microsoft.com and pre-authenticated, so no
    // bearer token should be sent to it.
    const monitorCall = fetchMock.mock.calls.find((c: any[]) =>
      (c[0] as string).startsWith('https://monitor.example/'),
    );
    expect(monitorCall).toBeDefined();
    expect(monitorCall![1].headers.Authorization).toBeUndefined();
  });

  it('copy-item includes the bearer token when the monitor URL stays on graph.microsoft.com', async () => {
    let monitorCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.endsWith('/copy')) {
        return Promise.resolve({
          ok: true,
          status: 202,
          json: () => Promise.resolve(null),
          text: () => Promise.resolve(''),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          headers: new Headers({
            location: 'https://graph.microsoft.com/v1.0/monitor/op-3',
          }),
        });
      }
      if (typeof url === 'string' && url.includes('/monitor/')) {
        monitorCalls += 1;
        return Promise.resolve(jsonResponse({ status: 'completed', resourceId: 'copy-2' }));
      }
      return Promise.resolve(jsonResponse({ id: 'copy-2', name: 'a-copy.txt', file: {} }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'copy-item', {
      itemId: 'item-1',
      destinationFolderId: 'f-2',
      pollIntervalMs: 0,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    expect(monitorCalls).toBe(1);

    const monitorCall = fetchMock.mock.calls.find((c: any[]) =>
      (c[0] as string).includes('/monitor/'),
    );
    expect(monitorCall).toBeDefined();
    expect(monitorCall![1].headers.Authorization).toBe('Bearer test-access-token');
  });

  it('copy-item reports a failed copy operation', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.endsWith('/copy')) {
        return Promise.resolve({
          ok: true,
          status: 202,
          json: () => Promise.resolve(null),
          text: () => Promise.resolve(''),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          headers: new Headers({ location: 'https://monitor.example/op-2' }),
        });
      }
      return Promise.resolve(
        jsonResponse({ status: 'failed', error: { message: 'Name already exists' } }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'copy-item', {
      itemId: 'item-1',
      destinationFolderId: 'f-2',
      pollIntervalMs: 0,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('Name already exists');
  });

  it('copy-item surfaces the Graph error message when the copy fails to start', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.endsWith('/copy')) {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                code: 'nameAlreadyExists',
                message: 'An item with this name already exists in this location.',
                innerError: { 'request-id': 'req-copy-1' },
              },
            },
            409,
          ),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'copy-item', {
      itemId: 'item-1',
      destinationFolderId: 'f-2',
      pollIntervalMs: 0,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('An item with this name already exists');
    expect(error.message as string).toContain('req-copy-1');
  });

  it('create-share-link requests the given link type and scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'perm-1',
        link: { type: 'view', scope: 'anonymous', webUrl: 'https://1drv.ms/abc' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-share-link', {
      itemId: 'item-1',
      type: 'edit',
      scope: 'organization',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.url).toBe('https://1drv.ms/abc');

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('createLink'),
    );
    expect(call![0]).toContain('/me/drive/items/item-1');
    expect(call![1].method).toBe('POST');
    const body = JSON.parse(call![1].body);
    expect(body.type).toBe('edit');
    expect(body.scope).toBe('organization');
  });

  it('invite-people sends recipients and a role', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ value: [{ id: 'perm-2', roles: ['write'] }] }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'invite-people', {
      itemId: 'item-1',
      emails: 'alice@example.com, bob@example.com',
      role: 'write',
      message: 'Please review',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/invite'),
    );
    expect(call![0]).toContain('/me/drive/items/item-1');
    expect(call![1].method).toBe('POST');
    const body = JSON.parse(call![1].body);
    expect(body.recipients).toEqual([{ email: 'alice@example.com' }, { email: 'bob@example.com' }]);
    expect(body.roles).toEqual(['write']);
    expect(body.message).toBe('Please review');
  });

  it('list-permissions returns formatted permissions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        value: [
          {
            id: 'perm-1',
            roles: ['read'],
            grantedToV2: { user: { displayName: 'Alice', email: 'alice@example.com' } },
          },
          { id: 'perm-2', roles: ['write'], link: { type: 'edit', scope: 'anonymous' } },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-permissions', { itemId: 'item-1' });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;
    const permissions = data.permissions as Array<Record<string, unknown>>;

    expect(data.count).toBe(2);
    expect(permissions[0].grantedTo).toBe('Alice <alice@example.com>');
    expect(permissions[1].linkType).toBe('edit');

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/permissions'),
    );
    expect(call![0]).toContain('/me/drive/items/item-1');
    expect(call![1].method).toBe('GET');
  });

  it('remove-permission deletes the permission', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve(null),
      text: () => Promise.resolve(''),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'remove-permission', { itemId: 'item-1', permissionId: 'perm-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'DELETE');
    expect(call![0]).toContain('/me/drive/items/item-1');
    expect(call![0]).toContain('/permissions/perm-1');
  });

  it('list-shared-with-me formats the remoteItem facets, not the shortcut entry', async () => {
    // Real /me/drive/sharedWithMe shape: an entry is a shortcut, and the
    // file/folder/size facets describe the item on the owner's drive, under
    // `remoteItem`. A fixture that puts them at the top level would let a
    // formatItem(item) bug pass, reporting every shared folder as a file.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        value: [
          {
            id: 'shortcut-1',
            name: 'Team Plan.docx',
            remoteItem: {
              id: 'remote-1',
              name: 'Team Plan.docx',
              file: {
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              },
              size: 24576,
              lastModifiedDateTime: '2026-08-11T09:00:00Z',
              webUrl: 'https://contoso-my.sharepoint.com/plan',
              parentReference: { driveId: 'b!drive-of-alice', id: 'alice-root' },
            },
          },
          {
            id: 'shortcut-2',
            name: 'Design Assets',
            remoteItem: {
              id: 'remote-2',
              name: 'Design Assets',
              folder: { childCount: 12 },
              size: 0,
              lastModifiedDateTime: '2026-08-12T09:00:00Z',
              webUrl: 'https://contoso-my.sharepoint.com/assets',
              parentReference: { driveId: 'b!drive-of-bob', id: 'bob-root' },
            },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-shared-with-me', {});

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;
    const items = data.items as Array<Record<string, unknown>>;

    expect(data.count).toBe(2);

    expect(items[0].name).toBe('Team Plan.docx');
    expect(items[0].type).toBe('file');
    expect(items[0].size).toBe(24576);
    expect(items[0].remoteItemId).toBe('remote-1');
    expect(items[0].remoteDriveId).toBe('b!drive-of-alice');

    // The shared *folder* is the case the old fixture could not express.
    expect(items[1].name).toBe('Design Assets');
    expect(items[1].type).toBe('folder');
    expect(items[1].childCount).toBe(12);
    expect(items[1].remoteItemId).toBe('remote-2');
    expect(items[1].remoteDriveId).toBe('b!drive-of-bob');

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('sharedWithMe'),
    );
    expect(call).toBeDefined();
    expect(call![1].method).toBe('GET');
  });

  it('list-recent returns recently accessed items', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ value: [{ id: 'r-1', name: 'recent.txt', file: {} }] }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-recent', {});

    const result = await waitForType('tool_result');
    expect((result.result as Record<string, unknown>).count).toBe(1);

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/me/drive/recent'),
    );
    expect(call).toBeDefined();
    expect(call![1].method).toBe('GET');
  });

  it('get-drive-info reports quota', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'drive-1',
        driveType: 'personal',
        quota: {
          total: 1099511627776,
          used: 549755813888,
          remaining: 549755813888,
          state: 'normal',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-drive-info', {});

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;
    const quota = data.quota as Record<string, unknown>;

    expect(data.driveType).toBe('personal');
    expect(quota.usedGB).toBe('512.00');
    expect(quota.totalGB).toBe('1024.00');

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].endsWith('/me/drive'),
    );
    expect(call).toBeDefined();
    expect(call![1].method).toBe('GET');
  });

  /**
   * Suite spec §9.1 lists honoring `Retry-After` as a required Graph-client
   * deviation test. The station harness polls on real timers, so these drive
   * `createGraphClient` directly and advance fake timers instead of waiting.
   */
  describe('Retry-After', () => {
    /** Minimal SecretsContext over the same fixtures the harness uses. */
    function directCtx() {
      return {
        secrets: {
          getSystem: async () => systemSecrets,
          getInstallation: async () => installationSecrets,
          updateInstallation: async (s: Record<string, string>) => {
            updatedSecrets.push(s);
          },
        },
      };
    }

    /**
     * Throttles the first call with the given Retry-After, then succeeds.
     * Returns the client plus a live counter of Graph attempts.
     */
    async function throttleOnce(retryAfter: string) {
      const counter = { calls: 0 };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => {
          counter.calls += 1;
          if (counter.calls === 1) {
            return Promise.resolve(
              jsonResponse({ error: { code: 'activityLimitReached' } }, 429, {
                'retry-after': retryAfter,
              }),
            );
          }
          return Promise.resolve(jsonResponse({ id: 'drive-1', driveType: 'personal' }));
        }),
      );

      // EXPIRY_DATE and EMAIL are both set, so building the client makes no
      // network call and the counter only ever sees graphRequest attempts.
      const client = await createGraphClient(directCtx());
      return { client, counter };
    }

    it('waits the advertised Retry-After instead of the exponential backoff', async () => {
      const { client, counter } = await throttleOnce('5');

      vi.useFakeTimers();
      try {
        const pending = client.graphRequest('GET', '/me/drive');
        await vi.advanceTimersByTimeAsync(0);
        expect(counter.calls).toBe(1);

        // Exponential backoff for attempt 0 is 1000 ms. Still waiting at 4999 ms
        // proves the server's 5 s value won, not the fallback.
        await vi.advanceTimersByTimeAsync(4_999);
        expect(counter.calls).toBe(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(counter.calls).toBe(2);

        await expect(pending).resolves.toMatchObject({ id: 'drive-1' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('clamps a large Retry-After to the 10 s ceiling', async () => {
      // 600 s advertised. Without MAX_RETRY_DELAY_MS the request would hang for
      // ten minutes; with it the retry fires at exactly 10 s.
      const { client, counter } = await throttleOnce('600');

      vi.useFakeTimers();
      try {
        const pending = client.graphRequest('GET', '/me/drive');
        await vi.advanceTimersByTimeAsync(0);
        expect(counter.calls).toBe(1);

        await vi.advanceTimersByTimeAsync(9_999);
        expect(counter.calls).toBe(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(counter.calls).toBe(2);

        await expect(pending).resolves.toMatchObject({ id: 'drive-1' });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('list-versions returns the version history of an item', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        value: [
          { id: '2.0', lastModifiedDateTime: '2026-08-10T10:00:00Z', size: 2048 },
          { id: '1.0', lastModifiedDateTime: '2026-08-09T10:00:00Z', size: 1024 },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-versions', { itemId: 'item-1' });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;
    const versions = data.versions as Array<Record<string, unknown>>;

    expect(data.count).toBe(2);
    expect(versions[0].id).toBe('2.0');
    expect(versions[0].size).toBe(2048);

    const call = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/versions'),
    );
    expect(call).toBeDefined();
    expect(call![0]).toContain('/me/drive/items/item-1');
    expect(call![1].method).toBe('GET');
  });
});
