/**
 * Tests for the Microsoft Excel Agent App.
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
import {
  assertXlsx,
  encodePathSegments,
  escapeODataLiteral,
  normalizePath,
  rangeRef,
  terminalRef,
  workbookItemRef,
  worksheetRef,
} from '../src/lib/helpers.js';

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
    host: { name: 'test', version: '1.0.1' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitForType('initialized');

  received.length = 0;
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'inst_excel',
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
    context: { userId: 'u_test', installationId: 'inst_excel' },
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

/** Finds the Graph call whose URL matches, ignoring the OAuth token endpoint. */
function graphCall(fetchMock: ReturnType<typeof vi.fn>, predicate: (url: string) => boolean) {
  return fetchMock.mock.calls.find(
    (c: unknown[]) => typeof c[0] === 'string' && !c[0].includes('/oauth2/') && predicate(c[0]),
  );
}

beforeEach(() => {
  systemSecrets = {
    CLIENT_ID: 'test-client-id',
    CLIENT_SECRET: 'test-client-secret',
    REDIRECT_URI: 'http://localhost/callback',
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
    appId: 'app.microsoft.excel',
    appVersion: '1.0.1',
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

    // The app persists refreshed tokens through this callback.
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

describe('Microsoft Excel Agent App', () => {
  it('has a manifest that passes the protocol schema', () => {
    const manifestPath = join(__dirname, '..', 'agentapp.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    const result = safeParseAppManifest(manifest);

    expect(result.success).toBe(true);
    expect(manifest.id).toBe('app.microsoft.excel');
    expect(manifest.version).toBe('1.0.1');
    expect(manifest.auth.scopes).toContain('Files.ReadWrite.All');
    // Least privilege: SharePoint site access belongs to OneDrive alone.
    expect(manifest.auth.scopes).not.toContain('Sites.Read.All');
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
      'add-chart',
      'add-table',
      'add-table-rows',
      'add-worksheet',
      'calculate-workbook',
      'clear-range',
      'create-workbook',
      'delete-rows-or-columns',
      'delete-worksheet',
      'format-range',
      'get-chart-image',
      'get-workbook',
      'insert-rows-or-columns',
      'list-tables',
      'list-worksheets',
      'read-range',
      'read-used-range',
      'rename-worksheet',
      'sort-range',
      'write-range',
    ]);
  });

  it('health check reports ready when tokens are valid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'drive-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');

    // Assert the Graph call actually happened — the SDK's default health
    // status is already 'ready', so this must not pass against a client
    // that was never invoked.
    const call = graphCall(fetchMock, (u) => u.includes('/me/drive'));
    expect(call).toBeDefined();
    expect(call![1].method).toBe('GET');
  });

  it('health check reports degraded when credentials are missing', async () => {
    systemSecrets = {};
    installationSecrets = {};

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
  });

  it('persists refreshed tokens', async () => {
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
      return Promise.resolve(jsonResponse({ id: 'drive-1' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
    expect(updatedSecrets.length).toBeGreaterThan(0);

    const persisted = updatedSecrets[0];
    expect(persisted.ACCESS_TOKEN).toBe('refreshed-access-token');
    expect(persisted.REFRESH_TOKEN).toBe('refreshed-refresh-token');
    // expires_in: 60 must drive EXPIRY_DATE — a hardcoded 3600 fallback would
    // land far outside this window.
    const expiryMs = new Date(persisted.EXPIRY_DATE).getTime();
    expect(expiryMs).toBeGreaterThan(Date.now());
    expect(expiryMs).toBeLessThan(Date.now() + 120_000);
  });

  it('never leaks a token in an error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'InvalidAuthenticationToken',
              message: 'Access token is expired.',
              innerError: { 'request-id': 'req-excel-1' },
            },
          },
          403,
        ),
      ),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
    const serialized = JSON.stringify(health);
    expect(serialized).not.toContain('test-access-token');
    expect(serialized).not.toContain('test-refresh-token');
    expect(serialized).not.toContain('Bearer');
  });

  it('retries a throttled GET', async () => {
    // Excel is the most aggressively throttled app in this suite (spec §5, §11),
    // so the copied client's retry behaviour is verified here, not assumed.
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve(
          jsonResponse({ error: { code: 'activityLimitReached' } }, 429, { 'retry-after': '0' }),
        );
      }
      return Promise.resolve(jsonResponse({ id: 'drive-1' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    // Session open makes no Graph calls of its own, so this reset is
    // future-proofing rather than dead code — it protects the count below
    // if that ever changes.
    calls = 0;

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
    expect(calls).toBe(2);
  });

  it('gives up after three throttled attempts', async () => {
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
    calls = 0;

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
    expect(calls).toBe(3);
  });

  it('refreshes and replays a GET that 401s mid-flight', async () => {
    // Suite spec §8.1 row 1 and §9.1's required 401 error path. The proactive
    // refresh cannot cover a token revoked between calls, so a mid-flight 401
    // must trigger exactly one refresh and one replay.
    let graphCalls = 0;
    let tokenCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/oauth2/v2.0/token')) {
        tokenCalls += 1;
        return Promise.resolve(jsonResponse({ access_token: 'replayed-token', expires_in: 3600 }));
      }
      graphCalls += 1;
      if (graphCalls === 1) {
        return Promise.resolve(
          jsonResponse(
            { error: { code: 'InvalidAuthenticationToken', message: 'Access token is expired.' } },
            401,
          ),
        );
      }
      return Promise.resolve(
        jsonResponse({
          value: [{ id: '{S1}', name: 'Sheet1', position: 0, visibility: 'Visible' }],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    graphCalls = 0;
    tokenCalls = 0;
    received.length = 0;
    sendToolCall(sessionId, 'list-worksheets', { itemId: 'wb-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    expect((result.result as Record<string, unknown>).count).toBe(1);

    // Exactly one refresh, exactly one replay — not one refresh per attempt.
    expect(tokenCalls).toBe(1);
    expect(graphCalls).toBe(2);

    // The replay must carry the refreshed token, not the rejected one.
    const graphRequests = fetchMock.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && !c[0].includes('/oauth2/'),
    );
    expect(graphRequests[1][1].headers.Authorization).toBe('Bearer replayed-token');
  });

  it('gives up with the reconnect message when a GET 401s again after the refresh', async () => {
    // Suite spec §8.1 row 2. `unauthorizedRetryUsed` caps the refresh at one
    // per call: a second 401 must surface the reconnect message rather than
    // spend the remaining attempts refreshing a refresh token that is dead.
    let graphCalls = 0;
    let tokenCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/oauth2/v2.0/token')) {
        tokenCalls += 1;
        return Promise.resolve(jsonResponse({ access_token: 'replayed-token', expires_in: 3600 }));
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
    tokenCalls = 0;
    received.length = 0;
    sendToolCall(sessionId, 'list-worksheets', { itemId: 'wb-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain(
      'reconnect your Microsoft account',
    );

    // One refresh, not one per attempt — this is what pins the retry cap.
    expect(tokenCalls).toBe(1);
    expect(graphCalls).toBe(2);
  });

  it('replays a POST once after a 401 and no more', async () => {
    // The 401 replay is the one carve-out from the §8.2 no-POST-retry rule:
    // Graph rejects at the auth layer before processing, so the replay cannot
    // double-create. It must still fire exactly once, not once per attempt.
    let graphCalls = 0;
    let tokenCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/oauth2/v2.0/token')) {
        tokenCalls += 1;
        return Promise.resolve(jsonResponse({ access_token: 'replayed-token', expires_in: 3600 }));
      }
      graphCalls += 1;
      if (graphCalls === 1) {
        return Promise.resolve(
          jsonResponse(
            { error: { code: 'InvalidAuthenticationToken', message: 'Access token is expired.' } },
            401,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ index: 4 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    graphCalls = 0;
    tokenCalls = 0;
    received.length = 0;
    sendToolCall(sessionId, 'add-table-rows', {
      itemId: 'wb-1',
      table: 'Expenses',
      values: [['Widget', 9.5]],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    // Two POSTs, not three: one rejected at the auth layer, one replayed.
    expect(graphCalls).toBe(2);
    expect(tokenCalls).toBe(1);
    const posts = fetchMock.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && !c[0].includes('/oauth2/'),
    );
    expect(posts.every((c: any) => c[1].method === 'POST')).toBe(true);
  });

  it('names the missing scope on a 403 accessDenied', async () => {
    // Suite spec §8.1 row 4: "Name the missing scope", not just that one is missing.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { code: 'accessDenied', message: 'Access denied.' } }, 403),
        ),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-worksheets', { itemId: 'wb-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain(
      'Files.ReadWrite.All',
    );
  });

  it('does not blame a missing scope for a 403 that means something else', async () => {
    // An item-locked or conditional-access 403 is not a scope failure; telling
    // the agent to reconnect for a scope it already holds is a dead end.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: { code: 'notAllowed', message: 'The file is checked out by another user.' } },
            403,
          ),
        ),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-worksheets', { itemId: 'wb-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const message = (result.error as Record<string, unknown>).message as string;
    expect(message).toContain('checked out');
    expect(message).not.toContain('Files.ReadWrite.All');
  });

  it('truncates a non-JSON error body instead of inlining all of it', async () => {
    // Azure Front Door answers some 502s with a full HTML interstitial.
    const html = `<html><body>${'x'.repeat(60_000)}</body></html>`;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error('not JSON')),
        text: () => Promise.resolve(html),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        headers: new Headers({ 'content-type': 'text/html' }),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-worksheets', { itemId: 'wb-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const message = (result.error as Record<string, unknown>).message as string;
    expect(message).toContain('truncated');
    expect(message).toContain('60');
    expect(message.length).toBeLessThan(2500);
  });

  it('create-workbook uploads the empty template to the requested path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'wb-1', name: 'Budget.xlsx', size: 512 }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-workbook', { name: 'Budget.xlsx', parentPath: 'Finance' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect((data.workbook as Record<string, unknown>).name).toBe('Budget.xlsx');

    const call = graphCall(fetchMock, (u) => u.includes(':/content'));
    expect(call).toBeDefined();
    expect(call![1].method).toBe('PUT');
    expect(call![0]).toContain('/me/drive/root:/Finance/Budget.xlsx:/content');
    // A zero-byte body would produce an unusable workbook.
    expect((call![1].body as Buffer).length).toBeGreaterThan(200);
  });

  it('create-workbook appends .xlsx when the name omits it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'wb-2', name: 'Plan.xlsx' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-workbook', { name: 'Plan' });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.includes(':/content'));
    expect(call![0]).toContain('/me/drive/root:/Plan.xlsx:/content');
  });

  it('create-workbook fails rather than replacing an existing file by default', async () => {
    // conflictBehavior=replace would swap a populated workbook for an empty one.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'wb-3', name: 'Q3.xlsx' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-workbook', { name: 'Q3.xlsx' });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.includes(':/content'));
    expect(call![0]).toContain('@microsoft.graph.conflictBehavior=fail');
    expect(call![0]).not.toContain('conflictBehavior=replace');
  });

  it('create-workbook replaces only when overwrite is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'wb-4', name: 'Q3.xlsx' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-workbook', { name: 'Q3.xlsx', overwrite: true });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.includes(':/content'));
    expect(call![0]).toContain('@microsoft.graph.conflictBehavior=replace');
  });

  it('create-workbook rejects a missing name with a clear error', async () => {
    // `required` in the JSON schema is declarative only — nothing enforces
    // it before the handler runs, so an omitted `name` must not crash.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-workbook', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain('name');
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('get-workbook refuses a non-xlsx item with an actionable message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ id: 'doc-1', name: 'Report.docx', file: {} })),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-workbook', { itemId: 'doc-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('.xlsx');
  });

  it('get-workbook refuses a folder with a clear error', async () => {
    // A folder has no `file` facet at all — a different failure mode than
    // a wrong-extension file, and worth a message that says so plainly.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ id: 'folder-1', name: 'Reports', folder: {} })),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-workbook', { itemId: 'folder-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('folder');
  });

  it('get-workbook resolves a path-form target without a stray colon before the query string', async () => {
    // workbookItemRef's path form keeps a trailing `:` for a child segment
    // to follow (`:/workbook`). When the ref is itself the final resource —
    // as it is here, followed only by `?$select=` — that colon must be
    // stripped, or Graph sees `…/Budget.xlsx:?$select=…` instead of
    // `…/Budget.xlsx?$select=…`.
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.endsWith('/worksheets')) {
        return Promise.resolve(jsonResponse({ value: [] }));
      }
      return Promise.resolve(jsonResponse({ id: 'wb-1', name: 'Budget.xlsx', file: {} }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-workbook', { path: 'Finance/Budget.xlsx' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const metaCall = graphCall(fetchMock, (u) => u.includes('$select='));
    expect(metaCall![0]).toContain('/me/drive/root:/Finance/Budget.xlsx?$select=');
    expect(metaCall![0]).not.toContain(':?');
  });

  it('get-workbook returns metadata and its worksheets', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.endsWith('/worksheets')) {
        return Promise.resolve(
          jsonResponse({
            value: [
              { id: '{S1}', name: 'Sheet1', position: 0, visibility: 'Visible' },
              { id: '{S2}', name: 'Data', position: 1, visibility: 'Visible' },
            ],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          id: 'wb-1',
          name: 'Budget.xlsx',
          size: 8192,
          webUrl: 'https://onedrive.live.com/budget',
          lastModifiedDateTime: '2026-08-20T10:00:00Z',
          file: {},
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-workbook', { itemId: 'wb-1' });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;

    expect(data.name).toBe('Budget.xlsx');
    expect(data.worksheetCount).toBe(2);
    expect((data.worksheets as Array<Record<string, unknown>>)[1].name).toBe('Data');

    // The metadata request must select `file` — get-workbook branches on it.
    const metaCall = graphCall(fetchMock, (u) => u.includes('$select='));
    expect(metaCall![0]).toContain('file');
  });

  it('calculate-workbook posts the requested calculation type', async () => {
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
    sendToolCall(sessionId, 'calculate-workbook', { itemId: 'wb-1', calculationType: 'Full' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = graphCall(fetchMock, (u) => u.endsWith('/application/calculate'));
    expect(call![1].method).toBe('POST');
    expect(JSON.parse(call![1].body).calculationType).toBe('Full');
  });

  it('does not retry a throttled POST', async () => {
    // Retrying a POST that already reached Graph can double-create. The client
    // enforces this; calculate-workbook is this app's first POST tool.
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
    calls = 0;
    received.length = 0;
    sendToolCall(sessionId, 'calculate-workbook', { itemId: 'wb-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect(calls).toBe(1);
  });

  it('workbook tools reject a missing target with a clear error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    // Typo'd argument name: must not silently address something else.
    sendToolCall(sessionId, 'get-workbook', { itmeId: 'wb-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain('itemId or path');
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('list-worksheets returns formatted worksheets', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        value: [
          { id: '{S1}', name: 'Sheet1', position: 0, visibility: 'Visible' },
          { id: '{S2}', name: 'Hidden', position: 1, visibility: 'Hidden' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-worksheets', { itemId: 'wb-1' });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;
    const sheets = data.worksheets as Array<Record<string, unknown>>;

    expect(data.count).toBe(2);
    expect(sheets[1].visibility).toBe('Hidden');

    const call = graphCall(fetchMock, (u) => u.endsWith('/worksheets'));
    expect(call![0]).toContain('/me/drive/items/wb-1/workbook/worksheets');
    expect(call![1].method).toBe('GET');
  });

  it('add-worksheet posts the requested name', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: '{S3}', name: 'Q3', position: 2, visibility: 'Visible' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-worksheet', { itemId: 'wb-1', name: 'Q3' });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;
    expect((data.worksheet as Record<string, unknown>).name).toBe('Q3');

    const call = graphCall(fetchMock, (u) => u.endsWith('/worksheets/add'));
    expect(call![1].method).toBe('POST');
    expect(JSON.parse(call![1].body).name).toBe('Q3');
  });

  it('delete-worksheet encodes the worksheet name in the URL', async () => {
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
    // A worksheet name is a path segment: '#' would otherwise truncate the URL.
    sendToolCall(sessionId, 'delete-worksheet', { itemId: 'wb-1', worksheet: 'Q3 #draft' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = graphCall(fetchMock, (u) => u.includes('/worksheets/'));
    expect(call![1].method).toBe('DELETE');
    expect(call![0]).toContain('/worksheets/Q3%20%23draft');
    expect(call![0]).not.toContain('#');
  });

  it('rename-worksheet patches the name', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: '{S1}', name: 'Renamed', position: 0, visibility: 'Visible' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'rename-worksheet', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      newName: 'Renamed',
    });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;
    expect((data.worksheet as Record<string, unknown>).name).toBe('Renamed');

    const call = graphCall(fetchMock, (u) => u.includes('/worksheets/Sheet1'));
    expect(call![1].method).toBe('PATCH');
    expect(JSON.parse(call![1].body).name).toBe('Renamed');
  });

  it('worksheet tools reject a missing worksheet argument', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'delete-worksheet', { itemId: 'wb-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain('worksheet');
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('read-range returns values, text and formulas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        address: 'Sheet1!A1:B2',
        values: [
          ['Item', 'Cost'],
          ['Widget', 9.5],
        ],
        text: [
          ['Item', 'Cost'],
          ['Widget', '$9.50'],
        ],
        formulas: [
          ['Item', 'Cost'],
          ['Widget', '=B3*1.1'],
        ],
        numberFormat: [
          ['General', 'General'],
          ['General', '$#,##0.00'],
        ],
        rowCount: 2,
        columnCount: 2,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'read-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:B2',
    });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;

    expect(data.address).toBe('Sheet1!A1:B2');
    expect(data.rowCount).toBe(2);
    expect((data.values as unknown[][])[1][1]).toBe(9.5);
    expect((data.formulas as unknown[][])[1][1]).toBe('=B3*1.1');

    const call = graphCall(fetchMock, (u) => u.includes('range(address='));
    expect(call![1].method).toBe('GET');
    expect(call![0]).toContain('/worksheets/Sheet1/range(address=');
    // The read must select every field the tool returns.
    expect(call![0]).toContain('formulas');
    expect(call![0]).toContain('numberFormat');
  });

  it('read-range escapes an apostrophe in the address', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ address: 'x', values: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    // A sheet-qualified address carries apostrophes that would otherwise
    // terminate the OData string literal.
    sendToolCall(sessionId, 'read-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: "'Q3 Data'!A1:B2",
    });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.includes('range(address='));
    // encodeURIComponent leaves apostrophes unescaped, so the doubled
    // apostrophe produced by escapeODataLiteral survives literally in the
    // URL. An address that reached Graph with escaping bypassed would carry
    // only a single apostrophe here, so this substring proves escaping ran.
    expect(call![0]).toContain("''Q3%20Data''!A1%3AB2");
  });

  it('read-used-range reads the whole populated area', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        address: 'Sheet1!A1:C4',
        values: [['a']],
        text: [['a']],
        formulas: [['a']],
        rowCount: 4,
        columnCount: 3,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'read-used-range', { itemId: 'wb-1', worksheet: 'Sheet1' });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;

    expect(data.address).toBe('Sheet1!A1:C4');
    expect(data.columnCount).toBe(3);

    const call = graphCall(fetchMock, (u) => u.includes('usedRange'));
    expect(call![1].method).toBe('GET');
    expect(call![0]).toContain('/worksheets/Sheet1/usedRange');
  });

  it('read-used-range can restrict to cells with values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ address: 'Sheet1!A1', values: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'read-used-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      valuesOnly: true,
    });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.includes('usedRange'));
    expect(call![0]).toContain('usedRange(valuesOnly=true)');
  });

  it('read-range rejects a missing address', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'read-range', { itemId: 'wb-1', worksheet: 'Sheet1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain('A1 notation');
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('write-range patches values by default', async () => {
    // rowCount/columnCount deliberately differ from the 2x2 payload shape,
    // so the assertions below can prove the handler reports what Graph
    // actually wrote rather than echoing the client's request shape back.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ address: 'Sheet1!A1:B2', rowCount: 3, columnCount: 5 }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'write-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:B2',
      values: [
        ['Item', 'Cost'],
        ['Widget', 9.5],
      ],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.wrote).toBe('values');
    // Graph's reported shape must win over the 2x2 shape of the request.
    expect(data.rowCount).toBe(3);
    expect(data.columnCount).toBe(5);

    const call = graphCall(fetchMock, (u) => u.includes('range(address='));
    expect(call![1].method).toBe('PATCH');

    const body = JSON.parse(call![1].body);
    expect(body.values[1][1]).toBe(9.5);
    expect(body.formulas).toBeUndefined();
  });

  it('write-range sends formulas when the flag is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ address: 'Sheet1!C1:C2' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'write-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'C1:C2',
      values: [['=A1*B1'], ['=A2*B2']],
      formulas: true,
    });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;
    expect(data.wrote).toBe('formulas');

    const call = graphCall(fetchMock, (u) => u.includes('range(address='));
    const body = JSON.parse(call![1].body);
    expect(body.formulas[0][0]).toBe('=A1*B1');
    expect(body.values).toBeUndefined();
  });

  it('write-range rejects a non-rectangular payload before calling Graph', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'write-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:B2',
      values: ['Item', 'Cost'],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    // Unique to this branch: the empty-array branch also says "array of rows".
    expect((result.error as Record<string, unknown>).message as string).toContain(
      'each entry is itself an array of cells',
    );
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('write-range rejects rows of unequal length before calling Graph', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'write-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:B2',
      values: [['a', 'b'], ['c']],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain(
      'same number of cells',
    );
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('write-range rejects an empty values array before calling Graph', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'write-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:B2',
      values: [],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain('non-empty');
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('clear-range posts the requested applyTo', async () => {
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
    sendToolCall(sessionId, 'clear-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:B2',
      applyTo: 'Contents',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = graphCall(fetchMock, (u) => u.endsWith('/clear'));
    expect(call![1].method).toBe('POST');
    expect(JSON.parse(call![1].body).applyTo).toBe('Contents');
  });

  it('clear-range defaults applyTo to All when omitted', async () => {
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
    sendToolCall(sessionId, 'clear-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:B2',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = graphCall(fetchMock, (u) => u.endsWith('/clear'));
    expect(call![1].method).toBe('POST');
    expect(JSON.parse(call![1].body).applyTo).toBe('All');
  });

  it('sort-range builds the fields array Graph expects', async () => {
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
    sendToolCall(sessionId, 'sort-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:C10',
      sortBy: [{ column: 1, ascending: false }, { column: 0 }],
      hasHeaders: true,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = graphCall(fetchMock, (u) => u.endsWith('/sort/apply'));
    expect(call![1].method).toBe('POST');

    const body = JSON.parse(call![1].body);
    expect(body.hasHeaders).toBe(true);
    expect(body.fields).toEqual([
      { key: 1, ascending: false, sortOn: 'Value' },
      { key: 0, ascending: true, sortOn: 'Value' },
    ]);
  });

  it('sort-range rejects an empty sortBy before calling Graph', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'sort-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:C10',
      sortBy: [],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain('sortBy');
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('sort-range rejects a sortBy entry missing a numeric column, with a distinct message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'sort-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:C10',
      sortBy: [{ ascending: true }],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const message = (result.error as Record<string, unknown>).message as string;
    expect(message).toContain('column');
    // Must be a distinct message from the empty-sortBy guard, so a collapsed
    // branch (both guards sharing one message) would be caught.
    expect(message).not.toContain('sortBy must list');
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('format-range sends number format sized to the range and styling on its format', async () => {
    // The range GET (looking up its shape) must return different data than
    // the two PATCH calls, so route by URL/method instead of one blanket
    // response.
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('$select=rowCount,columnCount')) {
        return Promise.resolve(jsonResponse({ rowCount: 9, columnCount: 1 }));
      }
      return Promise.resolve(jsonResponse({ address: 'Sheet1!B2:B10' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'format-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'B2:B10',
      numberFormat: '$#,##0.00',
      bold: true,
      fillColor: '#FFF2CC',
      horizontalAlignment: 'Right',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    // numberFormat is a property of the range itself, sized to the range's
    // 9-row by 1-column shape reported by the GET — not broadcast from a
    // single-cell array.
    const rangePatchCall = fetchMock.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        c[0].includes('range(address=') &&
        !c[0].includes('/format') &&
        (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(rangePatchCall).toBeDefined();
    const numberFormat = JSON.parse((rangePatchCall![1] as { body: string }).body).numberFormat;
    expect(numberFormat).toHaveLength(9);
    for (const row of numberFormat) {
      expect(row).toEqual(['$#,##0.00']);
    }

    // Font, fill and alignment live under /format.
    const formatCall = graphCall(fetchMock, (u) => u.endsWith('/format'));
    const formatBody = JSON.parse(formatCall![1].body);
    expect(formatBody.font.bold).toBe(true);
    expect(formatBody.fill.color).toBe('#FFF2CC');
    expect(formatBody.horizontalAlignment).toBe('Right');
  });

  it('format-range falls back to a single-cell array when the range GET reports no dimensions', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('$select=rowCount,columnCount')) {
        // No rowCount/columnCount in the response.
        return Promise.resolve(jsonResponse({}));
      }
      return Promise.resolve(jsonResponse({ address: 'Sheet1!B2:B10' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'format-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'B2:B10',
      numberFormat: '$#,##0.00',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const rangePatchCall = fetchMock.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        c[0].includes('range(address=') &&
        !c[0].includes('/format') &&
        (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(rangePatchCall).toBeDefined();
    expect(JSON.parse((rangePatchCall![1] as { body: string }).body).numberFormat).toEqual([
      ['$#,##0.00'],
    ]);
  });

  it('format-range with only numberFormat issues no /format call', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('$select=rowCount,columnCount')) {
        return Promise.resolve(jsonResponse({ rowCount: 9, columnCount: 1 }));
      }
      return Promise.resolve(jsonResponse({ address: 'Sheet1!B2:B10' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'format-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'B2:B10',
      numberFormat: '0.0%',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(graphCall(fetchMock, (u) => u.endsWith('/format'))).toBeUndefined();
    const rangePatchCall = fetchMock.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        c[0].includes('range(address=') &&
        !c[0].includes('/format') &&
        (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(rangePatchCall).toBeDefined();
  });

  it('format-range with only styling issues no range numberFormat PATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ address: 'Sheet1!B2:B10' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'format-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'B2:B10',
      italic: true,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    // No range-level PATCH (only the /format PATCH) — a dimensions GET or a
    // numberFormat PATCH here would mean the branches got coupled.
    const rangePatchCall = fetchMock.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        c[0].includes('range(address=') &&
        !c[0].includes('/format') &&
        (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(rangePatchCall).toBeUndefined();

    const formatCall = graphCall(fetchMock, (u) => u.endsWith('/format'));
    expect(formatCall).toBeDefined();
    expect(JSON.parse(formatCall![1].body).font.italic).toBe(true);
  });

  it('format-range reports styling failure without hiding that numberFormat already applied', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('$select=rowCount,columnCount')) {
        return Promise.resolve(jsonResponse({ rowCount: 9, columnCount: 1 }));
      }
      if (typeof url === 'string' && url.endsWith('/format')) {
        return Promise.resolve(jsonResponse({ error: { message: 'boom' } }, 500));
      }
      return Promise.resolve(jsonResponse({ address: 'Sheet1!B2:B10' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'format-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'B2:B10',
      numberFormat: '$#,##0.00',
      bold: true,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const message = (result.error as Record<string, unknown>).message as string;
    expect(message).toContain('Number format was applied');
    expect(message).toContain('styling failed');
  });

  it('format-range rejects a call that specifies nothing to change', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'format-range', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'B2:B10',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('insert-rows-or-columns shifts down for rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ address: 'Sheet1!A3:A4' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'insert-rows-or-columns', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A3:A4',
      direction: 'rows',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = graphCall(fetchMock, (u) => u.endsWith('/insert'));
    expect(call![1].method).toBe('POST');
    expect(JSON.parse(call![1].body).shift).toBe('Down');
  });

  it('insert-rows-or-columns shifts right for columns', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ address: 'Sheet1!B:B' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'insert-rows-or-columns', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'B:B',
      direction: 'columns',
    });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.endsWith('/insert'));
    expect(JSON.parse(call![1].body).shift).toBe('Right');
  });

  it('delete-rows-or-columns shifts up for rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'delete-rows-or-columns', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: '5:6',
      direction: 'rows',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const call = graphCall(fetchMock, (u) => u.endsWith('/delete'));
    expect(call![1].method).toBe('POST');
    expect(JSON.parse(call![1].body).shift).toBe('Up');
  });

  it('rejects a direction other than rows or columns', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'insert-rows-or-columns', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1',
      direction: 'diagonal',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain('direction');
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('list-tables returns formatted tables across the workbook', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        value: [
          {
            id: '1',
            name: 'Expenses',
            showHeaders: true,
            showTotals: false,
            style: 'TableStyleMedium2',
          },
          {
            id: '2',
            name: 'Income',
            showHeaders: true,
            showTotals: true,
            style: 'TableStyleLight1',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-tables', { itemId: 'wb-1' });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;
    const tables = data.tables as Array<Record<string, unknown>>;

    expect(data.count).toBe(2);
    expect(tables[1].showTotals).toBe(true);

    const call = graphCall(fetchMock, (u) => u.endsWith('/tables'));
    expect(call![1].method).toBe('GET');
    expect(call![0]).toContain('/workbook/tables');
  });

  it('add-table posts the address and header flag to the worksheet', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: '3', name: 'Table1', showHeaders: true }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-table', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:C10',
      hasHeaders: true,
    });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;
    expect((data.table as Record<string, unknown>).name).toBe('Table1');

    const call = graphCall(fetchMock, (u) => u.endsWith('/tables/add'));
    expect(call![1].method).toBe('POST');

    const body = JSON.parse(call![1].body);
    expect(body.address).toBe('A1:C10');
    expect(body.hasHeaders).toBe(true);
  });

  it('add-table defaults hasHeaders to true when omitted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: '3', name: 'Table1', showHeaders: true }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-table', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:C10',
    });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.endsWith('/tables/add'));
    const body = JSON.parse(call![1].body);
    expect(body.hasHeaders).toBe(true);
  });

  it('add-table honours an explicit hasHeaders:false', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: '3', name: 'Table1', showHeaders: false }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-table', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      address: 'A1:C10',
      hasHeaders: false,
    });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.endsWith('/tables/add'));
    const body = JSON.parse(call![1].body);
    expect(body.hasHeaders).toBe(false);
  });

  it('add-table-rows appends rows and encodes the table name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ index: 4 }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-table-rows', {
      itemId: 'wb-1',
      table: 'Q3 #expenses',
      values: [
        ['Widget', 9.5],
        ['Gadget', 12],
      ],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.rowsAdded).toBe(2);
    // Graph's response is the authority on where the rows landed.
    expect(data.index).toBe(4);

    const call = graphCall(fetchMock, (u) => u.endsWith('/rows/add'));
    expect(call![1].method).toBe('POST');
    // A table name is a path segment: '#' would otherwise truncate the URL.
    expect(call![0]).toContain('/tables/Q3%20%23expenses/rows/add');
    expect(call![0]).not.toContain('#');
    const body = JSON.parse(call![1].body);
    expect(body.values[1][0]).toBe('Gadget');
    // index was not supplied — it must not be sent as an explicit undefined.
    expect('index' in body).toBe(false);
  });

  it('add-table-rows sends an explicit index when supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ index: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-table-rows', {
      itemId: 'wb-1',
      table: 'Expenses',
      values: [['Widget', 9.5]],
      index: 2,
    });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.endsWith('/rows/add'));
    const body = JSON.parse(call![1].body);
    expect(body.index).toBe(2);
  });

  it('add-table-rows sends index 0 rather than dropping it as falsy', async () => {
    // `typeof a.index === 'number'` is load-bearing: a refactor to `a.index ||`
    // would silently turn "insert at the top" into "append to the end".
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ index: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-table-rows', {
      itemId: 'wb-1',
      table: 'Expenses',
      values: [['Widget', 9.5]],
      index: 0,
    });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.endsWith('/rows/add'));
    const body = JSON.parse(call![1].body);
    expect('index' in body).toBe(true);
    expect(body.index).toBe(0);
  });

  it('add-table-rows rejects a missing table before calling Graph', async () => {
    // Unguarded, `encodeURIComponent(undefined)` puts the literal string
    // "undefined" in the path and POSTs rows at /tables/undefined/rows/add.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-table-rows', {
      itemId: 'wb-1',
      tabel: 'Expenses',
      values: [['Widget', 9.5]],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain('Specify table');
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('add-table-rows rejects a non-rectangular payload before calling Graph', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-table-rows', {
      itemId: 'wb-1',
      table: 'Expenses',
      values: ['Widget', 9.5],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    // Unique to this branch: the empty-array branch also says "array of rows".
    expect((result.error as Record<string, unknown>).message as string).toContain(
      'each entry is itself an array of cells',
    );
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('add-table-rows rejects an empty values array before calling Graph', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-table-rows', {
      itemId: 'wb-1',
      table: 'Expenses',
      values: [],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain(
      'non-empty array of rows',
    );
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('add-table-rows rejects rows of unequal length before calling Graph', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-table-rows', {
      itemId: 'wb-1',
      table: 'Expenses',
      values: [['Widget', 9.5], ['Gadget']],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain(
      'same number of cells',
    );
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('add-chart posts type, source data and series orientation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: '{C1}', name: 'Chart 1', height: 216, width: 360 }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-chart', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      chartType: 'ColumnClustered',
      sourceData: 'A1:B10',
      seriesBy: 'Columns',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect((data.chart as Record<string, unknown>).name).toBe('Chart 1');

    const call = graphCall(fetchMock, (u) => u.endsWith('/charts/add'));
    expect(call![1].method).toBe('POST');

    const body = JSON.parse(call![1].body);
    expect(body.type).toBe('ColumnClustered');
    expect(body.sourceData).toBe('A1:B10');
    expect(body.seriesBy).toBe('Columns');
  });

  it('add-chart defaults seriesBy to Columns when omitted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: '{C1}', name: 'Chart 1', height: 216, width: 360 }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-chart', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      chartType: 'Line',
      sourceData: 'A1:B10',
    });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.endsWith('/charts/add'));
    const body = JSON.parse(call![1].body);
    expect(body.seriesBy).toBe('Columns');
  });

  it('get-chart-image returns the base64 PNG and encodes the chart name', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ value: 'iVBORw0KGgoAAAANSUhEUg==' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-chart-image', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      chart: 'Q3 #revenue',
      width: 800,
    });

    const result = await waitForType('tool_result');
    const data = result.result as Record<string, unknown>;

    expect(data.mimeType).toBe('image/png');
    expect(data.base64).toBe('iVBORw0KGgoAAAANSUhEUg==');
    // Returned unconditionally so the agent can see what the image cost it.
    expect(data.byteLength).toBe(16);

    const call = graphCall(fetchMock, (u) => u.includes('/image'));
    expect(call![1].method).toBe('GET');
    // A chart name is a path segment: '#' would otherwise truncate the URL.
    expect(call![0]).toContain('/charts/Q3%20%23revenue/image');
    expect(call![0]).not.toContain('#');
    expect(call![0]).toContain('width=800');
  });

  it('get-chart-image omits the dimensions suffix when width and height are not supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 'aGVsbG8=' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-chart-image', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      chart: 'Chart 1',
    });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.includes('/image'));
    expect(call![0]).toContain('/charts/Chart%201/image');
    // No dimensions supplied: the URL must not carry an empty or partial suffix.
    expect(call![0]).not.toContain('(');
    expect(call![0]).not.toContain(')');
  });

  it('get-chart-image joins width and height into a single suffix when both are supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 'aGVsbG8=' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-chart-image', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      chart: 'Chart 1',
      width: 640,
      height: 480,
    });

    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.includes('/image'));
    expect(call![0]).toContain('/image(width=640,height=480)');
  });

  it('get-chart-image rejects a missing chart before calling Graph', async () => {
    // Unguarded, `encodeURIComponent(undefined)` puts the literal string
    // "undefined" in the path and requests /charts/undefined/image.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 'aGVsbG8=' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-chart-image', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      chrat: 'Chart 1',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain('Specify chart');
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('get-chart-image refuses an oversized render and points at width and height', async () => {
    // 8 MB of base64 decodes to 6 MB — over the 5 MB cap.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ value: 'A'.repeat(8 * 1024 * 1024) })),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-chart-image', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      chart: 'Chart 1',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const message = (result.error as Record<string, unknown>).message as string;
    // The remedy must be actionable, not just a complaint about the size.
    expect(message).toContain('width');
    expect(message).toContain('height');
    expect(message).toContain('6291456');
  });

  it('get-chart-image reports a chart that returned no image data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-chart-image', {
      itemId: 'wb-1',
      worksheet: 'Sheet1',
      chart: 'Chart 1',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).message as string).toContain('no image');
  });
});

describe('Excel addressing helpers', () => {
  describe('normalizePath', () => {
    it('strips a trailing slash', () => {
      expect(normalizePath('/Finance/Budgets/')).toBe('/Finance/Budgets');
    });

    it('normalizes a bare slash to the drive root', () => {
      expect(normalizePath('/')).toBe('');
    });

    it('normalizes an empty string to the drive root', () => {
      expect(normalizePath('')).toBe('');
    });

    it('adds a leading slash when missing', () => {
      expect(normalizePath('Finance/Budget.xlsx')).toBe('/Finance/Budget.xlsx');
    });
  });

  describe('encodePathSegments', () => {
    it('encodes a `#` inside a segment', () => {
      expect(encodePathSegments('/Finance/Q1 #2.xlsx')).toBe('/Finance/Q1%20%232.xlsx');
    });

    it('preserves the `/` separators rather than encoding them as %2F', () => {
      const encoded = encodePathSegments('/Finance/Reports/Budget.xlsx');
      expect(encoded).toBe('/Finance/Reports/Budget.xlsx');
      expect(encoded).not.toContain('%2F');
    });
  });

  describe('assertXlsx', () => {
    it('accepts .xlsx case-insensitively', () => {
      expect(() => assertXlsx('Budget.XLSX')).not.toThrow();
    });

    it('rejects a non-.xlsx extension', () => {
      expect(() => assertXlsx('Report.docx')).toThrow('.xlsx');
    });
  });

  describe('escapeODataLiteral', () => {
    it('doubles apostrophes', () => {
      expect(escapeODataLiteral("O'Brien's Sheet")).toBe("O''Brien''s Sheet");
    });
  });

  describe('workbookItemRef', () => {
    it('builds the itemId form', () => {
      expect(workbookItemRef({ itemId: 'wb-1' })).toBe('/me/drive/items/wb-1');
    });

    it('builds the path form', () => {
      expect(workbookItemRef({ path: 'Finance/Budget.xlsx' })).toBe(
        '/me/drive/root:/Finance/Budget.xlsx:',
      );
    });

    it('throws when neither itemId nor path is given, rather than defaulting', () => {
      expect(() => workbookItemRef({})).toThrow('itemId or path');
    });
  });

  describe('terminalRef', () => {
    it('strips a single trailing colon', () => {
      expect(terminalRef('/me/drive/root:/Finance/Budget.xlsx:')).toBe(
        '/me/drive/root:/Finance/Budget.xlsx',
      );
    });

    it('leaves a ref with no trailing colon unchanged', () => {
      expect(terminalRef('/me/drive/items/wb-1')).toBe('/me/drive/items/wb-1');
    });
  });

  describe('worksheetRef', () => {
    it('composes onto the workbook ref', () => {
      expect(worksheetRef({ itemId: 'wb-1', worksheet: 'Sheet1' })).toBe(
        '/me/drive/items/wb-1/workbook/worksheets/Sheet1',
      );
    });

    it('throws when worksheet is missing', () => {
      expect(() => worksheetRef({ itemId: 'wb-1' })).toThrow('worksheet');
    });
  });

  describe('rangeRef', () => {
    it('composes onto the worksheet ref', () => {
      expect(rangeRef({ itemId: 'wb-1', worksheet: 'Sheet1', address: 'A1:C10' })).toBe(
        "/me/drive/items/wb-1/workbook/worksheets/Sheet1/range(address='A1%3AC10')",
      );
    });

    it('throws when address is missing', () => {
      expect(() => rangeRef({ itemId: 'wb-1', worksheet: 'Sheet1' })).toThrow('address');
    });
  });
});
