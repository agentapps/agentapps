/**
 * Tests for the Trello Agent App.
 *
 * Migrated from mca.trello/test/unit/ (bun:test -> vitest, MCA context -> Agent Apps SDK).
 *
 * Coverage:
 *   1. trelloRequest — HTTP boundary (migrated from old client tests)
 *   2. TrelloApiError classification — helper unit tests
 *   3. Integration via InProcessRuntime: tool listing, health check, sample tool calls
 *   4. Missing credentials handling
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
import {
  classifyTrelloError,
  extractTrelloMessage,
  type SecretsContext,
  TrelloApiError,
  trelloRequest,
} from '../src/lib/index.js';

// ---------------------------------------------------------------------------
// Test harness (InProcessRuntime pattern, from elevenlabs reference)
// ---------------------------------------------------------------------------

let appStation: AppStation;
let host: Transport;
let received: MessageBase[];
let systemSecrets: Record<string, string>;
let installationSecrets: Record<string, string>;

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
    installationId: 'inst_trello',
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
    context: { userId: 'u_test', installationId: 'inst_trello' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  systemSecrets = { TRELLO_API_KEY: 'k_test' };
  installationSecrets = { TRELLO_TOKEN: 't_test' };

  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
      json: () => Promise.resolve({ ok: true }),
      headers: new Headers(),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.trello',
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
  });

  appStation.accept(ctrlSide);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// 1. trelloRequest — HTTP boundary (unit, migrated from old trello.test.ts)
// ---------------------------------------------------------------------------

describe('trelloRequest — HTTP boundary', () => {
  function makeCtx(
    sys: Record<string, string> = { TRELLO_API_KEY: 'k_test' },
    usr: Record<string, string> = { TRELLO_TOKEN: 't_test' },
  ): SecretsContext {
    return {
      secrets: {
        getSystem: async () => sys,
        getInstallation: async () => usr,
      },
    };
  }

  it('GET: key/token as query params, no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'me' })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    await trelloRequest(makeCtx(), '/members/me');

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.origin + callUrl.pathname).toBe('https://api.trello.com/1/members/me');
    expect(callUrl.searchParams.get('key')).toBe('k_test');
    expect(callUrl.searchParams.get('token')).toBe('t_test');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('POST with exact JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'b1' })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    await trelloRequest(makeCtx(), '/boards', {
      method: 'POST',
      body: { name: 'Tablero', defaultLists: true },
    });

    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'Tablero',
      defaultLists: true,
    });
    expect(fetchMock.mock.calls[0][1].headers['content-type']).toBe('application/json');
  });

  it('GET without body even if body option is not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({})),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    await trelloRequest(makeCtx(), '/members/me');

    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('error upstream throws TrelloApiError with status and message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('invalid id'),
        headers: new Headers(),
      }),
    );

    await expect(trelloRequest(makeCtx(), '/cards/xxx')).rejects.toThrow(TrelloApiError);
    await expect(trelloRequest(makeCtx(), '/cards/xxx')).rejects.toThrow('invalid id');
  });

  it('missing API key throws TrelloApiError', async () => {
    const ctx = makeCtx({}, { TRELLO_TOKEN: 't_test' });
    await expect(trelloRequest(ctx, '/members/me')).rejects.toThrow(TrelloApiError);
    await expect(trelloRequest(ctx, '/members/me')).rejects.toThrow('API key not configured');
  });

  it('missing token throws TrelloApiError', async () => {
    const ctx = makeCtx({ TRELLO_API_KEY: 'k_test' }, {});
    await expect(trelloRequest(ctx, '/members/me')).rejects.toThrow(TrelloApiError);
    await expect(trelloRequest(ctx, '/members/me')).rejects.toThrow('token not configured');
  });

  it('empty secrets throw TrelloApiError', async () => {
    const ctx = makeCtx({}, {});
    await expect(trelloRequest(ctx, '/members/me')).rejects.toThrow(TrelloApiError);
  });

  it('query params are appended to URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify([])),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    await trelloRequest(makeCtx(), '/search', {
      query: { query: 'test', modelTypes: 'cards', partial: false },
    });

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.searchParams.get('query')).toBe('test');
    expect(callUrl.searchParams.get('modelTypes')).toBe('cards');
    expect(callUrl.searchParams.get('partial')).toBe('false');
  });

  it('query with special characters survives encoding', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({})),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    await trelloRequest(makeCtx(), '/search', {
      query: { query: 'presupuesto&sprint=3' },
    });

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.searchParams.get('query')).toBe('presupuesto&sprint=3');
  });
});

// ---------------------------------------------------------------------------
// 2. TrelloApiError classification — helper unit tests
// ---------------------------------------------------------------------------

describe('classifyTrelloError', () => {
  it('401 -> AUTH_INVALID', () => {
    const result = classifyTrelloError(401, 'unauthorized');
    expect(result.code).toBe('AUTH_INVALID');
    expect(result.message).toBe('unauthorized');
    expect(result.action.type).toBe('user_action');
  });

  it('403 -> PERMISSION_DENIED', () => {
    const result = classifyTrelloError(403, 'forbidden');
    expect(result.code).toBe('PERMISSION_DENIED');
  });

  it('404 -> NOT_FOUND', () => {
    const result = classifyTrelloError(404, 'not found');
    expect(result.code).toBe('NOT_FOUND');
  });

  it('429 -> RATE_LIMITED', () => {
    const result = classifyTrelloError(429, 'rate limited');
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.action.type).toBe('auto_retry');
  });

  it('400 -> BAD_REQUEST', () => {
    const result = classifyTrelloError(400, 'bad request');
    expect(result.code).toBe('BAD_REQUEST');
  });

  it('500 -> PROVIDER_ERROR', () => {
    const result = classifyTrelloError(500, 'server error');
    expect(result.code).toBe('PROVIDER_ERROR');
    expect(result.action.type).toBe('auto_retry');
  });

  it('502 -> PROVIDER_ERROR', () => {
    const result = classifyTrelloError(502, 'bad gateway');
    expect(result.code).toBe('PROVIDER_ERROR');
  });
});

describe('extractTrelloMessage', () => {
  it('extracts string body', () => {
    expect(extractTrelloMessage('invalid id', 'fallback')).toBe('invalid id');
  });

  it('extracts message from object', () => {
    expect(extractTrelloMessage({ message: 'board not found' }, 'fallback')).toBe(
      'board not found',
    );
  });

  it('extracts error from object', () => {
    expect(extractTrelloMessage({ error: 'something wrong' }, 'fallback')).toBe('something wrong');
  });

  it('returns fallback for empty string', () => {
    expect(extractTrelloMessage('', 'fallback')).toBe('fallback');
  });

  it('returns fallback for null', () => {
    expect(extractTrelloMessage(null, 'fallback')).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// 3. Integration: tool listing (registry-sync migrated)
// ---------------------------------------------------------------------------

const ALL_TOOL_NAMES = [
  'add-comment',
  'add-label-to-card',
  'create-board',
  'create-card',
  'create-label',
  'create-list',
  'delete-board',
  'get-board',
  'get-card',
  'get-card-actions',
  'list-board-lists',
  'list-boards',
  'list-cards',
  'list-labels',
  'remove-label-from-card',
  'search',
  'update-board',
  'update-card',
  'update-list',
];

describe('Trello Agent App — integration', () => {
  it('lists all 19 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual(ALL_TOOL_NAMES);
  });

  it('health check calls /members/me and returns ready with valid credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'me', fullName: 'Test User' })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The health handler calls trelloRequest(ctx, '/members/me') to validate
    // credentials and returns { status: 'ready' } on success.
    expect(fetchMock).toHaveBeenCalled();
    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/members/me');
    expect(health.status).toBe('ready');
  });

  it('health check reports degraded when API call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('unauthorized'),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The health handler throws TrelloApiError, which the SDK catches and
    // reports as 'degraded' with the error message.
    expect(health.status).toBe('degraded');
    expect(health.message as string).toContain('Health check failed');
  });

  // -----------------------------------------------------------------------
  // Tool calls (migrated from old handler tests)
  // -----------------------------------------------------------------------

  it('list-boards: filter in query params, returns upstream JSON', async () => {
    const boards = [{ id: 'b1', name: 'Tablero' }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(boards)),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-boards', { filter: 'starred' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    // Verify fetch was called with correct URL
    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/members/me/boards');
    expect(callUrl.searchParams.get('filter')).toBe('starred');
  });

  it('list-boards: default filter=open when not specified', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify([])),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-boards', {});

    await waitForType('tool_result');

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.searchParams.get('filter')).toBe('open');
  });

  it('create-board: POST /boards with exact body (optionals only if present)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'newboard' })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-board', { name: 'Sprint', desc: 'Q3' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      name: 'Sprint',
      defaultLists: true,
      desc: 'Q3',
    });
  });

  it('delete-board: DELETE method to endpoint with boardId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ _value: null })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'delete-board', { boardId: 'b9' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/boards/b9');
  });

  it('search: query with special chars + default modelTypes/partial', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ cards: [] })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search', { query: 'tarea ano/2' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/search');
    expect(callUrl.searchParams.get('query')).toBe('tarea ano/2');
    expect(callUrl.searchParams.get('modelTypes')).toBe('cards');
    expect(callUrl.searchParams.get('partial')).toBe('false');
  });

  it('search: query with ampersand survives intact', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ cards: [] })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search', { query: 'presupuesto&sprint=3' });

    await waitForType('tool_result');

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.searchParams.get('query')).toBe('presupuesto&sprint=3');
    expect(callUrl.searchParams.get('modelTypes')).toBe('cards');
  });

  it('update-card: PUT with only the fields present', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'c1', name: 'Nuevo titulo' })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'update-card', { cardId: 'c1', name: 'Nuevo titulo' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/cards/c1');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ name: 'Nuevo titulo' });
  });

  it('missing credentials: tool call fails with auth error', async () => {
    systemSecrets = {};
    installationSecrets = {};

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-boards', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    // fetch should never have been called
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Additional tool tests (new — not in old test suite)
  // -----------------------------------------------------------------------

  it('get-board: GET /boards/{boardId}', async () => {
    const board = { id: 'b1', name: 'My Board', desc: 'Test board' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(board)),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-board', { boardId: 'b1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/boards/b1');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });

  it('create-card: POST /cards with listId mapped to idList', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'card1' })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-card', { listId: 'list1', name: 'New Card', desc: 'Details' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.idList).toBe('list1');
    expect(body.name).toBe('New Card');
    expect(body.desc).toBe('Details');
  });

  it('get-card: GET /cards/{cardId}', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'c1', name: 'Card One' })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-card', { cardId: 'c1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/cards/c1');
  });

  it('list-cards: GET /lists/{listId}/cards', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify([{ id: 'c1' }, { id: 'c2' }])),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-cards', { listId: 'list1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/lists/list1/cards');
  });

  it('add-comment: POST /cards/{cardId}/actions/comments', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'act1' })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'add-comment', { cardId: 'c1', text: 'Hello world' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/cards/c1/actions/comments');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toBe('Hello world');
  });

  it('create-list: POST /lists with boardId mapped to idBoard', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'list1' })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-list', { boardId: 'b1', name: 'To Do' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.name).toBe('To Do');
    expect(body.idBoard).toBe('b1');
  });

  it('list-board-lists: GET /boards/{boardId}/lists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify([{ id: 'l1', name: 'To Do' }])),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-board-lists', { boardId: 'b1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/boards/b1/lists');
  });

  it('update-board: PUT /boards/{boardId} with partial body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'b1', name: 'Renamed' })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'update-board', { boardId: 'b1', name: 'Renamed' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/boards/b1');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ name: 'Renamed' });
  });

  it('create-label: POST /boards/{boardId}/labels', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'lbl1' })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-label', { boardId: 'b1', name: 'Bug', color: 'red' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/boards/b1/labels');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ name: 'Bug', color: 'red' });
  });

  it('add-label-to-card: POST /cards/{cardId}/idLabels', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify([{ id: 'lbl1' }])),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'add-label-to-card', { cardId: 'c1', labelId: 'lbl1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/cards/c1/idLabels');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.value).toBe('lbl1');
  });

  it('remove-label-from-card: DELETE /cards/{cardId}/idLabels/{labelId}', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({})),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'remove-label-from-card', { cardId: 'c1', labelId: 'lbl1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/cards/c1/idLabels/lbl1');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('update-list: PUT /lists/{listId}', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 'l1', name: 'Done' })),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'update-list', { listId: 'l1', name: 'Done', closed: true });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/lists/l1');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.name).toBe('Done');
    expect(body.closed).toBe(true);
  });

  it('list-labels: GET /boards/{boardId}/labels', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify([{ id: 'lbl1', name: 'Bug', color: 'red' }])),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-labels', { boardId: 'b1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/boards/b1/labels');
  });

  it('get-card-actions: GET /cards/{cardId}/actions with filter param', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify([{ id: 'act1', type: 'commentCard' }])),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-card-actions', { cardId: 'c1', filter: 'commentCard' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const callUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(callUrl.pathname).toBe('/1/cards/c1/actions');
    expect(callUrl.searchParams.get('filter')).toBe('commentCard');
  });

  it('tool call with API error returns success=false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('board not found'),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-board', { boardId: 'nonexistent' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });
});
