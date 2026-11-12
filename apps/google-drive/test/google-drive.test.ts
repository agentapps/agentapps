/**
 * Integration tests for the Google Drive Agent App.
 *
 * Mocks the googleapis module so tests run without real credentials.
 * Uses the InProcessRuntime harness from the reference elevenlabs pattern.
 *
 * Migrated from mca.google.drive/test/{document-creation,shared-drive,query}.test.ts
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock googleapis BEFORE importing the app factory.
//
// vi.mock is hoisted above all other code, so we use vi.hoisted() to declare
// variables that must be accessible inside the mock factory.
// ---------------------------------------------------------------------------

const { mockDriveCalls, mockDrive, mockOAuth2 } = vi.hoisted(() => {
  const mockDriveCalls: Record<string, any> = {};

  function makeMockFn(name: string, defaultData: any) {
    const fn = async (params: any) => {
      mockDriveCalls[name] = params;
      return { data: defaultData };
    };
    // We'll replace with vi.fn in beforeEach — for now just use a callable
    const mock = Object.assign(fn, {
      mockClear: () => {},
      mockImplementation: (impl: any) => {
        Object.assign(mock, impl);
      },
    }) as any;
    return mock;
  }

  const mockDrive = {
    about: {
      get: async () => ({ data: { user: { emailAddress: 'test@example.com' } } }),
    },
    files: {
      list: makeMockFn('list', { files: [], nextPageToken: 'tok', incompleteSearch: false }),
      get: makeMockFn('get', { id: 'f1', name: 'n', parents: ['p0'], mimeType: 'text/plain' }),
      create: makeMockFn('create', {
        id: 'f1',
        name: 'n',
        mimeType: 'application/vnd.google-apps.document',
        webViewLink: 'https://docs.google.com/document/d/f1/edit',
      }),
      update: makeMockFn('update', { id: 'f1', name: 'n' }),
      copy: makeMockFn('copy', { id: 'f2', name: 'copy' }),
      delete: makeMockFn('delete', {}),
    },
    permissions: {
      create: makeMockFn('permCreate', { id: 'perm1', role: 'reader' }),
    },
  };

  // Must be a regular function (not arrow) because it's used as a constructor via `new`
  const mockOAuth2 = function () {
    return {
      setCredentials: () => {},
      getTokenInfo: async () => ({}),
      credentials: { access_token: 'test-token', refresh_token: 'test-refresh' },
    };
  };

  return { mockDriveCalls, mockDrive, mockOAuth2 };
});

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: mockOAuth2 },
    drive: () => mockDrive,
  },
}));

// Import the app factory AFTER mocking
import { factory } from '../src/app.js';

// ---------------------------------------------------------------------------
// Test harness (same pattern as elevenlabs)
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
  timeoutMs = 5000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = received.find((m) => predicate(m as Record<string, unknown>));
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Timeout waiting for message');
}

async function waitForType(type: string, timeoutMs = 5000): Promise<Record<string, unknown>> {
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
    installationId: 'inst_google_drive',
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
    context: { userId: 'u_test', installationId: 'inst_google_drive' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset all mock call records
  for (const k of Object.keys(mockDriveCalls)) delete mockDriveCalls[k];

  // Override create to record requestBody and return dynamic data
  const _origCreate = mockDrive.files.create;
  mockDrive.files.create = (async (params: any) => {
    mockDriveCalls.create = params;
    return {
      data: {
        id: 'doc1',
        name: params.requestBody?.name ?? 'n',
        mimeType: params.requestBody?.mimeType ?? 'application/octet-stream',
        webViewLink: 'https://docs.google.com/document/d/doc1/edit',
      },
    };
  }) as any;

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.google.drive',
    appVersion: '2.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  // Auto-respond to secret requests
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
        secrets: {
          CLIENT_ID: 'test-client-id',
          CLIENT_SECRET: 'test-client-secret',
        },
      } as MessageBase);
    }
    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: {
          ACCESS_TOKEN: 'test-access-token',
          REFRESH_TOKEN: 'test-refresh-token',
        },
      } as MessageBase);
    }
  });

  appStation.accept(ctrlSide);
});

afterEach(async () => {
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Google Drive Agent App', () => {
  it('lists all expected tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;
    const toolNames = tools.map((t) => t.name).sort();

    expect(toolNames).toEqual([
      'copy-file',
      'create-comment',
      'create-document',
      'create-folder',
      'create-reply',
      'delete-comment',
      'delete-file',
      'download-file',
      'get-comment',
      'get-file',
      'get-file-content',
      'list-comments',
      'list-files',
      'list-replies',
      'move-file',
      'search-files',
      'share-file',
      'update-comment',
      'upload-file',
    ]);
  });

  it('health check reports ready with valid secrets', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The Drive health handler validates credentials by calling drive.about.get()
    // and returns { status: 'ready' } on success. The SDK correctly reports 'ready'.
    expect(health.status).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// Shared Drive params reach the Drive API boundary
// ---------------------------------------------------------------------------

describe('shared drive params reach the Drive API boundary', () => {
  it('list-files sends the shared-drive params to files.list', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'list-files', { folderId: 'shared-folder-id' });
    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.list).toBeDefined();
    expect(mockDriveCalls.list.supportsAllDrives).toBe(true);
    expect(mockDriveCalls.list.includeItemsFromAllDrives).toBe(true);
    expect(mockDriveCalls.list.corpora).toBe('allDrives');
    expect(mockDriveCalls.list.q).toBe("trashed=false and 'shared-folder-id' in parents");
  });

  it('search-files sends the full shared-drive list param set', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'search-files', { searchTerm: 'budget' });
    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.list).toBeDefined();
    expect(mockDriveCalls.list.supportsAllDrives).toBe(true);
    expect(mockDriveCalls.list.includeItemsFromAllDrives).toBe(true);
    expect(mockDriveCalls.list.corpora).toBe('allDrives');
  });

  it('get-file sends supportsAllDrives', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'get-file', { fileId: 'f1' });
    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.get).toBeDefined();
    expect(mockDriveCalls.get.supportsAllDrives).toBe(true);
    expect(mockDriveCalls.get.fileId).toBe('f1');
  });

  it('create-folder sends supportsAllDrives on files.create', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'create-folder', { name: 'New', parentFolderId: 'shared-folder' });
    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.create).toBeDefined();
    expect(mockDriveCalls.create.supportsAllDrives).toBe(true);
  });

  it('copy-file sends supportsAllDrives on files.copy', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'copy-file', { fileId: 'f1' });
    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.copy).toBeDefined();
    expect(mockDriveCalls.copy.supportsAllDrives).toBe(true);
  });

  it('delete-file sends supportsAllDrives on files.delete', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'delete-file', { fileId: 'f1' });
    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.delete).toBeDefined();
    expect(mockDriveCalls.delete.supportsAllDrives).toBe(true);
  });

  it('move-file sends supportsAllDrives on BOTH files.get and files.update', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'move-file', { fileId: 'f1', newParentId: 'p2' });
    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.get).toBeDefined();
    expect(mockDriveCalls.get.supportsAllDrives).toBe(true);
    expect(mockDriveCalls.update).toBeDefined();
    expect(mockDriveCalls.update.supportsAllDrives).toBe(true);
  });

  it('share-file sends supportsAllDrives on permissions.create', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'share-file', { fileId: 'f1', emailAddress: 'a@b.com' });
    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.permCreate).toBeDefined();
    expect(mockDriveCalls.permCreate.supportsAllDrives).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// create-document creates a NATIVE Google Doc
// ---------------------------------------------------------------------------

describe('create-document creates a NATIVE Google Doc', () => {
  it('default html: target=document, source=text/html, ALL_DRIVES', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'create-document', {
      title: 'Informe Q3',
      content: '<h1>Hola</h1>',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    // The two fields that TOGETHER trigger the conversion:
    expect(mockDriveCalls.create.requestBody.mimeType).toBe('application/vnd.google-apps.document');
    expect(mockDriveCalls.create.media.mimeType).toBe('text/html');
    expect(mockDriveCalls.create.requestBody.name).toBe('Informe Q3');
    expect(mockDriveCalls.create.supportsAllDrives).toBe(true);
    expect(mockDriveCalls.create.requestBody.parents).toBeUndefined();
    expect(mockDriveCalls.create.fields).toBe('id, name, mimeType, webViewLink');

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('doc1');
    expect(data.mimeType).toBe('application/vnd.google-apps.document');
  });

  it('contentType=markdown: source text/markdown, target still a Doc', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'create-document', {
      title: 'Notas',
      content: '# Titulo',
      contentType: 'markdown',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.create.media.mimeType).toBe('text/markdown');
    expect(mockDriveCalls.create.requestBody.mimeType).toBe('application/vnd.google-apps.document');
  });

  it('contentType=text: source text/plain', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'create-document', {
      title: 'Plano',
      content: 'solo texto',
      contentType: 'text',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.create.media.mimeType).toBe('text/plain');
  });

  it('parentFolderId is forwarded as parents[]', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'create-document', {
      title: 'En carpeta',
      content: '<p>x</p>',
      parentFolderId: 'folder-123',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.create.requestBody.parents).toEqual(['folder-123']);
  });

  it('rejects empty content', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'create-document', { title: 'x', content: '' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  it('rejects empty title', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'create-document', { title: '   ', content: 'y' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  it('rejects invalid contentType', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'create-document', {
      title: 'x',
      content: 'y',
      contentType: 'pdf',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// list-files and search-files query building through the runtime
// ---------------------------------------------------------------------------

describe('query building through the runtime', () => {
  it('list-files passes the built (escaped) query through to files.list', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'list-files', { query: "not 'me' in owners" });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.list.q).toBe("trashed=false and name contains 'not \\'me\\' in owners'");
  });

  it('list-files rejects an empty driveQuery at the boundary', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'list-files', { driveQuery: '   ' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  it('search-files escapes the search term', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'search-files', { searchTerm: "O'Brien" });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(mockDriveCalls.list.q).toBe("name contains 'O\\'Brien' and trashed = false");
  });
});

// ---------------------------------------------------------------------------
// Structural guard: no gated Drive call without shared-drive params
// ---------------------------------------------------------------------------

describe('structural guard: no gated Drive call without shared-drive params', () => {
  const GATED =
    /clients\.drive\.(?:files\.(?:get|list|create|update|copy|delete)|permissions\.(?:create|update|delete|get|list))\b/g;

  it('every gated call-site spreads ALL_DRIVES within its arguments', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { dirname } = await import('node:path');

    const toolsDir = join(dirname(fileURLToPath(import.meta.url)), '../src/tools');

    const sources = readdirSync(toolsDir)
      .filter((f: string) => f.endsWith('.ts'))
      .map((f: string) => ({ file: f, content: readFileSync(join(toolsDir, f), 'utf-8') }));

    const offenders: string[] = [];
    let total = 0;
    for (const { file, content } of sources) {
      for (const match of content.matchAll(GATED)) {
        total++;
        const window = content.slice(match.index, (match.index ?? 0) + 500);
        if (!window.includes('...ALL_DRIVES')) {
          offenders.push(`${file}: ${match[0]}`);
        }
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('files.export / comments / replies are NOT given shared-drive params', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { dirname } = await import('node:path');

    const toolsDir = join(dirname(fileURLToPath(import.meta.url)), '../src/tools');

    const BYID = /clients\.drive\.(?:files\.export|comments\.\w+|replies\.\w+)\b/g;

    const sources = readdirSync(toolsDir)
      .filter((f: string) => f.endsWith('.ts'))
      .map((f: string) => ({ file: f, content: readFileSync(join(toolsDir, f), 'utf-8') }));

    const offenders: string[] = [];
    for (const { file, content } of sources) {
      for (const match of content.matchAll(BYID)) {
        const window = content.slice(match.index, (match.index ?? 0) + 300);
        if (window.includes('...ALL_DRIVES')) offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
