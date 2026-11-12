/**
 * Tests for the Excalidraw Agent App.
 *
 * Mocks the Excalidraw Plus API so tests run without real credentials.
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
import { factory } from '../src/app.js';

// ---------------------------------------------------------------------------
// Test harness
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
    installationId: 'inst_excalidraw',
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
    context: { userId: 'u_test', installationId: 'inst_excalidraw' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.excalidraw',
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
        secrets: { EXCALIDRAW_API_KEY: 'test-excalidraw-key' },
      } as MessageBase);
    }
  });

  appStation.accept(ctrlSide);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Excalidraw Agent App', () => {
  it('lists all 26 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'create-collection',
      'create-collection-scene',
      'create-invite',
      'create-scene',
      'delete-collection',
      'delete-invite',
      'delete-scene',
      'get-collection',
      'get-collection-scenes',
      'get-invite',
      'get-scene',
      'get-scene-content',
      'get-user',
      'get-workspace',
      'list-collections',
      'list-invites',
      'list-logs',
      'list-scenes',
      'list-users',
      'remove-user',
      'update-collection',
      'update-invite',
      'update-scene',
      'update-scene-content',
      'update-user',
      'update-workspace',
    ]);
  });

  it('health check reports ready with valid API key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'ws_1', name: 'Test Workspace' }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
    expect((health.message as string).toLowerCase()).toContain('connected');
  });

  it('list-scenes returns paginated scene data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 'scene_1',
                name: 'Architecture Diagram',
                workspace: 'ws_1',
                pinned: false,
                isDeleted: false,
                isPrivate: false,
                created: '2024-01-01T00:00:00Z',
                updated: '2024-01-02T00:00:00Z',
              },
              {
                id: 'scene_2',
                name: 'Wireframe',
                workspace: 'ws_1',
                pinned: true,
                isDeleted: false,
                isPrivate: false,
                created: '2024-01-03T00:00:00Z',
                updated: '2024-01-04T00:00:00Z',
              },
            ],
            nextCursor: 'cursor_abc',
            hasMore: true,
          }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-scenes', { limit: 2 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const scenes = data.data as Array<Record<string, unknown>>;
    expect(scenes).toHaveLength(2);
    expect(scenes[0].name).toBe('Architecture Diagram');
    expect(scenes[1].name).toBe('Wireframe');
    expect(data.hasMore).toBe(true);
    expect(data.nextCursor).toBe('cursor_abc');
  });

  it('create-scene creates a new scene', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'scene_new',
            name: 'My New Scene',
            workspace: 'ws_1',
            collection: 'col_1',
            pinned: false,
            isDeleted: false,
            isPrivate: false,
            created: '2024-06-01T00:00:00Z',
            updated: '2024-06-01T00:00:00Z',
          }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-scene', {
      name: 'My New Scene',
      collectionId: 'col_1',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('scene_new');
    expect(data.name).toBe('My New Scene');
    expect(data.collection).toBe('col_1');
  });

  it('create-scene calls correct API endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'scene_new', name: 'Test' }),
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-scene', {
      name: 'Test Scene',
      collectionId: 'col_42',
      pinned: true,
    });

    await waitForType('tool_result');

    // Verify fetch was called with the correct URL and body
    const calls = fetchMock.mock.calls;
    const createCall = calls.find(
      (c: [string, RequestInit]) => c[0].includes('/scenes') && c[1]?.method === 'POST',
    );
    expect(createCall).toBeDefined();
    expect(createCall![0]).toContain('api.excalidraw.com/api/v1/scenes');

    const body = JSON.parse(createCall![1].body as string);
    expect(body.name).toBe('Test Scene');
    expect(body.collectionId).toBe('col_42');
    expect(body.pinned).toBe(true);
  });

  it('list-collections returns collection data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 'col_1',
                name: 'Design',
                workspace: 'ws_1',
                created: '2024-01-01T00:00:00Z',
                updated: '2024-01-01T00:00:00Z',
              },
              {
                id: 'col_2',
                name: 'Engineering',
                workspace: 'ws_1',
                created: '2024-02-01T00:00:00Z',
                updated: '2024-02-01T00:00:00Z',
              },
            ],
            hasMore: false,
          }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-collections', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const collections = data.data as Array<Record<string, unknown>>;
    expect(collections).toHaveLength(2);
    expect(collections[0].name).toBe('Design');
    expect(collections[1].name).toBe('Engineering');
  });

  it('tool call fails on 401 API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-scenes', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('401');
  });

  it('tool call fails on 404 API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-scene', { sceneId: 'nonexistent' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('404');
  });
});
