/**
 * Tests for the Microsoft OneNote Agent App.
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
import { marked } from 'marked';
import TurndownService from 'turndown';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, factory } from '../src/app.js';
import {
  assertDisplayName,
  buildMultipartPage,
  buildPageHtml,
  escapeHtml,
  escapeODataLiteral,
  formatPage,
  formatSection,
  htmlToMarkdown,
  markdownToHtmlFragment,
  optionalId,
  requireId,
} from '../src/lib/helpers.js';
import { createGraphClient, type SecretsContext } from '../src/lib/index.js';

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
    host: { name: 'test', version: '1.0.2' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitForType('initialized');

  received.length = 0;
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'inst_onenote',
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
    context: { userId: 'u_test', installationId: 'inst_onenote' },
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

/**
 * Builds a fetch mock response with an HTML body. OneNote page content is
 * served as text/html, so a JSON-shaped mock would not exercise the client's
 * content-type sniff at all.
 */
function htmlResponse(html: string, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(html),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    headers: new Headers({ 'content-type': 'text/html', ...headers }),
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
    appId: 'app.microsoft.onenote',
    appVersion: '1.0.2',
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

describe('Microsoft OneNote Agent App', () => {
  it('has a manifest that passes the protocol schema', () => {
    const manifestPath = join(__dirname, '..', 'agentapp.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    const result = safeParseAppManifest(manifest);

    expect(result.success).toBe(true);
    expect(manifest.id).toBe('app.microsoft.onenote');
    expect(manifest.version).toBe('1.0.2');
    expect(manifest.auth.scopes).toContain('Notes.ReadWrite.All');
    expect(manifest.auth.scopes).toContain('Notes.Create');
    // Least privilege (spec §3.3): drive and SharePoint scopes belong to the
    // file-oriented apps. OneNote reaches pages through /me/onenote alone.
    expect(manifest.auth.scopes).not.toContain('Files.ReadWrite.All');
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
    // Compare the whole parsed object, not a hand-maintained field list: a
    // list only catches the fields someone remembered to write down, and in
    // OneDrive it missed `entrypoint` and `tagline` — the two that had
    // actually drifted. Both sides go through `safeParseAppManifest` first
    // so schema-applied defaults land on both and don't read as drift.
    const manifestPath = join(__dirname, '..', 'agentapp.json');
    const checkedInResult = safeParseAppManifest(JSON.parse(readFileSync(manifestPath, 'utf-8')));
    const generatedResult = safeParseAppManifest(app.toManifest());

    expect(checkedInResult.success).toBe(true);
    expect(generatedResult.success).toBe(true);
    if (!checkedInResult.success || !generatedResult.success) return;

    expect(generatedResult.data).toEqual(checkedInResult.data);
  });

  it('can convert markdown to HTML and back under this package layout', async () => {
    // `turndown` is new to this repo and is CJS-first with a bundled DOM.
    // Its ESM default-import interop is the kind of thing that typechecks
    // and then throws at runtime, so prove both directions work here rather
    // than discovering it inside a tool in Task 6.
    marked.setOptions({ gfm: true, breaks: false });
    const html = await marked.parse('# Title\n\nHello **world**.');

    expect(html).toContain('<h1>');
    expect(html).toContain('<strong>world</strong>');

    const turndown = new TurndownService({ headingStyle: 'atx' });
    const markdown = turndown.turndown(html);

    expect(markdown).toContain('# Title');
    expect(markdown).toContain('**world**');
  });

  it('opens a session and reports health', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  /**
   * A minimal SecretsContext for testing the client directly. Records every
   * updateInstallation call so the token-persistence deviation can be asserted.
   */
  function fakeCtx(overrides: Partial<Record<string, string>> = {}): {
    ctx: SecretsContext;
    updates: Array<Record<string, string>>;
  } {
    const updates: Array<Record<string, string>> = [];
    const user: Record<string, string> = { ...installationSecrets, ...overrides } as Record<
      string,
      string
    >;
    const ctx: SecretsContext = {
      secrets: {
        getSystem: async () => systemSecrets,
        getInstallation: async () => user,
        updateInstallation: async (secrets) => {
          updates.push(secrets);
          Object.assign(user, secrets);
        },
      },
    };
    return { ctx, updates };
  }

  it('persists refreshed tokens through ctx.secrets.updateInstallation', async () => {
    // Deviation 1 (spec §3.2): Outlook refreshes into a local and discards the
    // result, paying a token round-trip on every call after expiry.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/oauth2/')) {
        return jsonResponse({
          access_token: 'refreshed-token',
          refresh_token: 'refreshed-refresh',
          expires_in: 3600,
        });
      }
      return jsonResponse({ value: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ctx, updates } = fakeCtx({ EXPIRY_DATE: new Date(Date.now() - 1000).toISOString() });
    const { graphRequest } = await createGraphClient(ctx);
    await graphRequest('GET', '/me/onenote/notebooks');

    expect(updates).toHaveLength(1);
    expect(updates[0].ACCESS_TOKEN).toBe('refreshed-token');
    expect(updates[0].REFRESH_TOKEN).toBe('refreshed-refresh');
    expect(Date.parse(updates[0].EXPIRY_DATE)).toBeGreaterThan(Date.now());

    // And the replayed Graph call must carry the NEW token, not the stale one.
    const call = graphCall(fetchMock, (u) => u.endsWith('/me/onenote/notebooks'));
    expect(call).toBeDefined();
    const headers = (call?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer refreshed-token');
  });

  it('never writes an undefined access token into durable storage', async () => {
    // A 200 with no access_token would otherwise persist `undefined` over
    // working credentials — an unrecoverable failure for the user.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/oauth2/')) return jsonResponse({ token_type: 'Bearer' });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ctx, updates } = fakeCtx({ EXPIRY_DATE: new Date(Date.now() - 1000).toISOString() });

    await expect(createGraphClient(ctx)).rejects.toThrow(/reconnect your account/i);
    expect(updates).toHaveLength(0);
  });

  it('retries a GET on 429 and honors Retry-After', async () => {
    // Deviation 2 (spec §3.2). OneNote throttles far more aggressively than Mail.
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ error: { code: 'activityLimitReached' } }, 429, {
          'retry-after': '0',
        });
      }
      return jsonResponse({ value: [{ id: 'nb1' }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ctx } = fakeCtx();
    const { graphRequest } = await createGraphClient(ctx);
    const result = await graphRequest<{ value: unknown[] }>('GET', '/me/onenote/notebooks');

    expect(calls).toBe(2);
    expect(result.value).toHaveLength(1);
  });

  it('does not retry a POST that already received a response', async () => {
    // Spec §8.2: retrying a POST that Graph answered can double-create. The
    // 429 carve-out does NOT extend to POST — only the 401 replay does.
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return jsonResponse({ error: { code: 'activityLimitReached' } }, 429, {
        'retry-after': '0',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ctx } = fakeCtx();
    const { graphRequest } = await createGraphClient(ctx);

    await expect(
      graphRequest('POST', '/me/onenote/sections/s1/pages', { title: 'x' }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('replays a POST exactly once after a 401', async () => {
    // Spec §8.2 carve-out: Graph rejects at the auth layer before processing,
    // so nothing was created and the replay cannot double-create. Capped at one.
    let graphCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/oauth2/')) {
        return jsonResponse({ access_token: 'fresh', expires_in: 3600 });
      }
      graphCalls += 1;
      if (graphCalls === 1)
        return jsonResponse({ error: { code: 'InvalidAuthenticationToken' } }, 401);
      return jsonResponse({ id: 'p1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ctx } = fakeCtx();
    const { graphRequest } = await createGraphClient(ctx);
    const created = await graphRequest<{ id: string }>('POST', '/me/onenote/sections/s1/pages', {});

    expect(created.id).toBe('p1');
    expect(graphCalls).toBe(2);
  });

  it('sends rawBody verbatim and lets the caller override Content-Type', async () => {
    // Deviation 4 (spec §3.2) — the one OneNote exists to exercise. If the
    // client JSON-stringifies the body or keeps its default application/json
    // header, every create-page call produces a silently malformed multipart
    // request. Assert both halves; a response-shape assertion cannot see either.
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'p1' }));
    vi.stubGlobal('fetch', fetchMock);

    const { ctx } = fakeCtx();
    const { graphRequest } = await createGraphClient(ctx);

    const payload = Buffer.from('--b\r\nContent-Disposition: form-data; name="Presentation"\r\n');
    await graphRequest('POST', '/me/onenote/sections/s1/pages', undefined, {
      rawBody: payload,
      headers: { 'Content-Type': 'multipart/form-data; boundary=b' },
    });

    const call = graphCall(fetchMock, (u) => u.endsWith('/sections/s1/pages'));
    expect(call).toBeDefined();
    const init = call?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('multipart/form-data; boundary=b');
    expect(Buffer.isBuffer(init.body)).toBe(true);
    expect((init.body as Buffer).equals(payload)).toBe(true);
  });

  it('surfaces the Graph request-id in error messages', async () => {
    // Spec §8.5: it is the first thing Microsoft support asks for.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: 'itemNotFound',
              message: 'The requested item was not found.',
              innerError: { 'request-id': 'req-abc-123' },
            },
          },
          404,
        ),
      ),
    );

    const { ctx } = fakeCtx();
    const { graphRequest } = await createGraphClient(ctx);

    await expect(graphRequest('GET', '/me/onenote/pages/missing')).rejects.toThrow(/req-abc-123/);
  });

  it('never leaks a token into an error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { code: 'accessDenied' } }, 403)),
    );

    const { ctx } = fakeCtx();
    const { graphRequest } = await createGraphClient(ctx);

    // Spec §8.5: no error message ever includes an Authorization header or a
    // token value — not just the literal token fixture used in this test.
    await expect(graphRequest('GET', '/me/onenote/notebooks')).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('test-access-token'),
      }),
    );
    await expect(graphRequest('GET', '/me/onenote/notebooks')).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringMatching(/Bearer|Authorization/),
      }),
    );
  });

  it('points a never-configured install at the CLI, naming this app', async () => {
    // Spec §8.1 treats four auth failures as distinct. This one is not
    // "reconnect your account" — nothing was ever configured, and the fix is a
    // CLI command. The copied client embeds the app id in that message, so
    // this also catches a missed substitution in the copy.
    systemSecrets = {};

    const { ctx } = fakeCtx();

    await expect(createGraphClient(ctx)).rejects.toThrow(
      /agentapps config app\.microsoft\.onenote/,
    );
  });

  it('names the scope this app actually needs on a 403', async () => {
    // Spec §8.1 row 4: a 403 means the token is valid but lacks the scope, so
    // the message must name it. REQUIRED_SCOPE is a per-app constant that
    // swaps when the client is copied — naming Excel's Files.ReadWrite.All
    // here would send a OneNote user to permission something this app never
    // requests. Nothing else in the suite covers that constant.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { code: 'accessDenied' } }, 403)),
    );

    const { ctx } = fakeCtx();
    const { graphRequest } = await createGraphClient(ctx);

    await expect(graphRequest('GET', '/me/onenote/notebooks')).rejects.toThrow(
      /Notes\.ReadWrite\.All/,
    );
  });

  it('reports health by reaching the OneNote endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ value: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
    // The health check must actually touch OneNote, not just /me — otherwise
    // it reports ready for an account with no Notes consent.
    expect(graphCall(fetchMock, (u) => u.includes('/me/onenote/notebooks'))).toBeDefined();
  });

  it('escapes apostrophes in OData literals', () => {
    // An apostrophe terminates the literal: search-pages on "Bob's notes"
    // would otherwise produce a malformed $filter, or worse, a valid one
    // that means something else. Same fix as OneDrive's search-items.
    expect(escapeODataLiteral("Bob's notes")).toBe("Bob''s notes");
    expect(escapeODataLiteral('plain')).toBe('plain');
  });

  it('escapes HTML in text destined for markup', () => {
    expect(escapeHtml('Q3 <Draft> & "final"')).toBe('Q3 &lt;Draft&gt; &amp; &quot;final&quot;');
  });

  it('requires an explicit id and percent-encodes it for URLs', () => {
    const ref = requireId({ pageId: '1-abc def' }, ['pageId'], 'the page id');

    expect(ref.id).toBe('1-abc def');
    expect(ref.encoded).toBe(encodeURIComponent('1-abc def'));
    expect(ref.encoded).not.toBe(ref.id);
  });

  it('accepts a documented alias for a parent id', () => {
    // Spec §3.4 names containers `parent…`; `sectionId` stays accepted because
    // it is the name an agent reaches for first. Both must work.
    const viaParent = requireId({ parentSectionId: 's1' }, ['parentSectionId', 'sectionId'], 'x');
    const viaAlias = requireId({ sectionId: 's1' }, ['parentSectionId', 'sectionId'], 'x');

    expect(viaParent.id).toBe('s1');
    expect(viaAlias.id).toBe('s1');
  });

  it('throws a named error rather than defaulting when no id is supplied', () => {
    // Lesson 4: a typo'd argument name must never silently retarget. JSON
    // Schema `required` is advisory in this stack — nothing validates args
    // before the handler runs.
    expect(() => requireId({ pagId: 'typo' }, ['pageId'], 'the page id')).toThrow(/pageId/);
    expect(() => requireId({}, ['pageId'], 'the page id')).toThrow(/the page id/);
    expect(() => requireId({ pageId: '   ' }, ['pageId'], 'the page id')).toThrow(/pageId/);
  });

  it('returns undefined for an absent optional id', () => {
    expect(optionalId({}, ['notebookId'])).toBeUndefined();
    expect(optionalId({ notebookId: 'nb1' }, ['notebookId'])?.encoded).toBe('nb1');
  });

  it('rejects display names OneNote would reject, naming the character', () => {
    expect(assertDisplayName('Q3 Planning', 'notebook name')).toBe('Q3 Planning');
    expect(() => assertDisplayName('Q3/Planning', 'notebook name')).toThrow(/\//);
    expect(() => assertDisplayName('What?', 'notebook name')).toThrow(/\?/);
    expect(() => assertDisplayName('a'.repeat(51), 'notebook name')).toThrow(/50/);
    expect(() => assertDisplayName('   ', 'notebook name')).toThrow(/notebook name/);
    expect(() => assertDisplayName(undefined, 'notebook name')).toThrow(/notebook name/);
  });

  it('converts markdown to an HTML fragment and passes HTML through', async () => {
    const fromMarkdown = await markdownToHtmlFragment('- one\n- two');
    expect(fromMarkdown).toContain('<li>one</li>');

    // The fixture has to be something `marked` would visibly change, or this
    // proves nothing: marked returns well-formed HTML blocks byte-for-byte
    // unchanged, so `<p>already <b>html</b></p>` comes back identical whether
    // or not the short-circuit exists. 'A & B' does differ — as markdown it
    // becomes '<p>A &amp; B</p>' — so running both branches over the same
    // input is what actually pins the behaviour down.
    const raw = 'A & B';
    expect(await markdownToHtmlFragment(raw, 'html')).toBe(raw);
    expect(await markdownToHtmlFragment(raw, 'markdown')).not.toBe(raw);
    expect(await markdownToHtmlFragment(raw, 'markdown')).toContain('&amp;');
  });

  it('renders the page title into <title>, escaped', async () => {
    // OneNote has no title field — the page title IS the <title> element. A
    // create-page that accepts a title and forgets this makes an untitled page.
    const body = await markdownToHtmlFragment('Hello');
    const html = buildPageHtml('Q3 <Draft> & Notes', body);

    expect(html).toContain('<title>Q3 &lt;Draft&gt; &amp; Notes</title>');
    expect(html).toContain('<body>');
    expect(html).toContain('Hello');
    // The body is intentional markup and must NOT be escaped.
    expect(html).not.toContain('&lt;p&gt;');
  });

  it('converts OneNote HTML back to markdown', () => {
    const html =
      '<html><body><div id="div:{1}" style="position:absolute"><h1>Title</h1>' +
      '<p>Hello <b>world</b>.</p></div></body></html>';

    const markdown = htmlToMarkdown(html);

    expect(markdown).toContain('# Title');
    expect(markdown).toContain('**world**');
    expect(markdown).not.toContain('position:absolute');
  });

  it('builds a multipart body OneNote will accept', () => {
    const { body, contentType } = buildMultipartPage('<html><body>hi</body></html>');
    const text = body.toString('utf-8');
    const boundary = contentType.replace('multipart/form-data; boundary=', '');

    expect(contentType.startsWith('multipart/form-data; boundary=')).toBe(true);
    // The part name is case-sensitive and the content type is mandatory.
    expect(text).toContain('Content-Disposition: form-data; name="Presentation"');
    expect(text).toContain('Content-Type: text/html');
    // CRLF, not LF — an LF-only envelope is not parsed.
    expect(text).toContain('\r\n\r\n<html><body>hi</body></html>\r\n');
    expect(text.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true);
    expect(text).not.toContain('\n\n');
  });

  it('regenerates the boundary when it occurs in the content', () => {
    // A boundary appearing inside the note truncates the part. This is a
    // latent corruption bug the day someone pastes a hex string into a page,
    // so the generator is injectable and the retry is asserted, not assumed.
    const html = '<html><body>collide</body></html>';
    const generated = ['collide', 'safe-boundary'];
    const { contentType, body } = buildMultipartPage(html, () => generated.shift() as string);

    expect(contentType).toBe('multipart/form-data; boundary=safe-boundary');
    expect(generated).toHaveLength(0);
    expect(body.toString('utf-8')).toContain('--safe-boundary--');
  });

  it('shapes a page and its parent section for the agent', () => {
    const shaped = formatPage({
      id: '1-p1',
      title: 'Meeting notes',
      createdDateTime: '2026-08-01T09:00:00Z',
      lastModifiedDateTime: '2026-08-02T09:00:00Z',
      level: 0,
      order: 1,
      links: { oneNoteWebUrl: { href: 'https://onenote.com/p1' } },
      parentSection: { id: '1-s1', displayName: 'Q3' },
    });

    expect(shaped).toEqual({
      id: '1-p1',
      title: 'Meeting notes',
      createdDateTime: '2026-08-01T09:00:00Z',
      lastModifiedDateTime: '2026-08-02T09:00:00Z',
      level: 0,
      order: 1,
      webUrl: 'https://onenote.com/p1',
      sectionId: '1-s1',
      sectionName: 'Q3',
    });
  });

  it('tolerates an unexpanded parent instead of throwing', () => {
    // The formatter reads the parent with a fallback and never branches on it,
    // so a response without $expand degrades visibly rather than crashing.
    const shaped = formatSection({ id: '1-s1', displayName: 'Q3' });

    expect(shaped.notebookId).toBeNull();
    expect(shaped.notebookName).toBeNull();
    expect(shaped.id).toBe('1-s1');
  });

  it('list-notebooks returns shaped notebooks', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        value: [
          {
            id: '1-nb1',
            displayName: 'Work',
            isDefault: true,
            isShared: false,
            createdDateTime: '2026-01-01T00:00:00Z',
            lastModifiedDateTime: '2026-08-01T00:00:00Z',
            links: { oneNoteWebUrl: { href: 'https://onenote.com/nb1' } },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'list-notebooks', {});
    const result = await waitForType('tool_result');

    const payload = result.result as Record<string, unknown>;
    expect(payload.count).toBe(1);
    expect((payload.notebooks as any[])[0]).toMatchObject({
      id: '1-nb1',
      displayName: 'Work',
      webUrl: 'https://onenote.com/nb1',
    });
    // Read-only tools do not report success (spec §3.4).
    expect(payload.success).toBeUndefined();

    const call = graphCall(fetchMock, (u) => u.includes('/me/onenote/notebooks'));
    expect(call?.[1]).toMatchObject({ method: 'GET' });
    expect(call?.[0]).toContain('$orderby=displayName');
  });

  it('get-notebook requires a notebook id and encodes it', async () => {
    // The fixture carries a slash on purpose. `encodeURIComponent` leaves
    // ! ~ * ' ( ) - _ . alone, so an id built from those makes this assertion
    // pass whether or not the tool encodes anything. A slash both changes
    // which resource the URL addresses and is actually escaped — the same
    // shape as the OneDrive delete-item bug in lesson 1.
    const fetchMock = vi.fn(async () => jsonResponse({ id: '1-nb/1', displayName: 'Work' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'get-notebook', { notebookId: '1-nb/1' });
    const result = await waitForType('tool_result');

    expect((result.result as any).notebook.id).toBe('1-nb/1');
    const call = graphCall(fetchMock, (u) => u.includes('/notebooks/'));
    expect(call?.[0]).toContain('/notebooks/1-nb%2F1');
    expect(call?.[0]).not.toContain('/notebooks/1-nb/1');
  });

  it('get-notebook fails clearly when the id is missing', async () => {
    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'get-notebook', { notebok: 'typo' });
    const result = await waitForType('tool_result');

    expect(result.error).toBeDefined();
    expect(String((result.error as any).message ?? result.error)).toMatch(/notebookId/);
  });

  it('create-notebook posts a display name and reports success', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: '1-nb2', displayName: 'Q3 Planning' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'create-notebook', { displayName: 'Q3 Planning' });
    const result = await waitForType('tool_result');

    const payload = result.result as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect((payload.notebook as any).id).toBe('1-nb2');

    const call = graphCall(fetchMock, (u) => u.endsWith('/me/onenote/notebooks'));
    expect(call?.[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse((call?.[1] as RequestInit).body as string)).toEqual({
      displayName: 'Q3 Planning',
    });
  });

  it('create-notebook rejects a name OneNote would reject, before calling Graph', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'create-notebook', { displayName: 'Q3/Planning' });
    const result = await waitForType('tool_result');

    expect(result.error).toBeDefined();
    // No notebook request was made — the validation happened first.
    expect(graphCall(fetchMock, (u) => u.endsWith('/me/onenote/notebooks'))).toBeUndefined();
  });

  it('list-sections scopes to a notebook when one is given', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        value: [
          {
            id: '1-s1',
            displayName: 'Q3',
            isDefault: false,
            createdDateTime: '2026-01-01T00:00:00Z',
            lastModifiedDateTime: '2026-08-01T00:00:00Z',
            parentNotebook: { id: '1-nb1', displayName: 'Work' },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'list-sections', { notebookId: '1-nb1' });
    const result = await waitForType('tool_result');

    const payload = result.result as Record<string, unknown>;
    expect((payload.sections as any[])[0]).toMatchObject({
      id: '1-s1',
      notebookId: '1-nb1',
      notebookName: 'Work',
    });

    const call = graphCall(fetchMock, (u) => u.includes('/sections'));
    expect(call?.[0]).toContain('/notebooks/1-nb1/sections');
    // The formatter reads parentNotebook, so the query must ask for it.
    expect(call?.[0]).toContain('$expand=parentNotebook');
  });

  it('list-sections falls back to every notebook when none is given', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ value: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'list-sections', {});
    await waitForType('tool_result');

    const call = graphCall(fetchMock, (u) => u.includes('/sections'));
    expect(call?.[0]).toContain('/me/onenote/sections');
    expect(call?.[0]).not.toContain('/notebooks/');
  });

  it('create-section accepts parentNotebookId and its notebookId alias', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: '1-s2', displayName: 'Q4' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'create-section', { parentNotebookId: '1-nb1', displayName: 'Q4' });
    const first = await waitForType('tool_result');
    expect((first.result as any).success).toBe(true);
    expect(graphCall(fetchMock, (u) => u.endsWith('/notebooks/1-nb1/sections'))).toBeDefined();

    received.length = 0;
    fetchMock.mockClear();
    sendToolCall(sessionId, 'create-section', { notebookId: '1-nb1', displayName: 'Q4' });
    const second = await waitForType('tool_result');
    expect((second.result as any).success).toBe(true);
    expect(graphCall(fetchMock, (u) => u.endsWith('/notebooks/1-nb1/sections'))).toBeDefined();
  });

  it('create-section refuses to guess a notebook', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'create-section', { displayName: 'Q4' });
    const result = await waitForType('tool_result');

    expect(result.error).toBeDefined();
    expect(String((result.error as any).message ?? result.error)).toMatch(/parentNotebookId/);
    expect(graphCall(fetchMock, (u) => u.includes('/sections'))).toBeUndefined();
  });

  it('list-section-groups scopes to a notebook when one is given', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        value: [{ id: '1-g1', displayName: 'Archive', parentNotebook: { id: '1-nb1' } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'list-section-groups', { notebookId: '1-nb1' });
    const result = await waitForType('tool_result');

    expect((result.result as any).sectionGroups[0].id).toBe('1-g1');
    const call = graphCall(fetchMock, (u) => u.includes('/sectionGroups'));
    expect(call?.[0]).toContain('/notebooks/1-nb1/sectionGroups');
    expect(call?.[0]).toContain('$expand=parentNotebook');
    expect((result.result as any).sectionGroups[0]).toMatchObject({ notebookId: '1-nb1' });
  });

  it('list-pages scopes to a section and asks for the parent it formats', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        value: [
          {
            id: '1-p1',
            title: 'Standup',
            createdDateTime: '2026-08-01T09:00:00Z',
            lastModifiedDateTime: '2026-08-02T09:00:00Z',
            level: 0,
            order: 0,
            parentSection: { id: '1-s1', displayName: 'Q3' },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'list-pages', { sectionId: '1-s1', top: 10 });
    const result = await waitForType('tool_result');

    const payload = result.result as Record<string, unknown>;
    expect((payload.pages as any[])[0]).toMatchObject({ id: '1-p1', sectionName: 'Q3' });

    const call = graphCall(fetchMock, (u) => u.includes('/pages'));
    expect(call?.[0]).toContain('/sections/1-s1/pages');
    expect(call?.[0]).toContain('$expand=parentSection');
    expect(call?.[0]).toContain('$top=10');
    // A raw space in a URL is not something to leave to fetch.
    expect(call?.[0]).toContain('$orderby=lastModifiedDateTime%20desc');
    expect(call?.[0]).not.toContain('lastModifiedDateTime desc');
  });

  it('list-pages clamps top into the range Graph accepts', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ value: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'list-pages', { top: 5000 });
    await waitForType('tool_result');

    expect(graphCall(fetchMock, (u) => u.includes('/pages'))?.[0]).toContain('$top=100');
  });

  it('get-page returns metadata for one page', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: '1-p1', title: 'Standup', parentSection: { id: '1-s1' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'get-page', { pageId: '1-p1' });
    const result = await waitForType('tool_result');

    expect((result.result as any).page.title).toBe('Standup');
    expect(graphCall(fetchMock, (u) => u.includes('/pages/1-p1'))?.[0]).toContain(
      '$expand=parentSection',
    );
  });

  it('get-page-content returns markdown by default', async () => {
    const fetchMock = vi.fn(async () =>
      htmlResponse('<html><body><h1>Standup</h1><p>Ship <b>it</b>.</p></body></html>'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'get-page-content', { pageId: '1-p1' });
    const result = await waitForType('tool_result');

    const payload = result.result as Record<string, unknown>;
    expect(payload.format).toBe('markdown');
    expect(payload.content).toContain('# Standup');
    expect(payload.content).toContain('**it**');

    const call = graphCall(fetchMock, (u) => u.includes('/content'));
    expect(call?.[0]).toContain('/pages/1-p1/content');
    expect(call?.[0]).not.toContain('includeIDs');
  });

  it('get-page-content forces HTML when element ids are requested', async () => {
    // The ids are the whole point of includeIDs, and converting to markdown
    // discards them. Returning markdown anyway would be a silent no-op.
    const fetchMock = vi.fn(async () =>
      htmlResponse('<html><body><p data-id="p:{1}">Ship it.</p></body></html>'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'get-page-content', {
      pageId: '1-p1',
      includeIDs: true,
      format: 'markdown',
    });
    const result = await waitForType('tool_result');

    const payload = result.result as Record<string, unknown>;
    expect(payload.format).toBe('html');
    expect(payload.content).toContain('data-id="p:{1}"');
    expect(String(payload.note)).toMatch(/includeIDs/);

    expect(graphCall(fetchMock, (u) => u.includes('/content'))?.[0]).toContain('includeIDs=true');
  });

  it('decodes page content as text even when Graph mislabels the content type', async () => {
    // This is the only test that can fail if `responseType: 'text'` is
    // removed. Every other get-page-content test mocks a text/html response,
    // and the client's content-type sniff already falls back to text for
    // those — so the option would look load-bearing while being dead code.
    // Labelling the body application/json forces the sniff down the
    // response.json() path unless the explicit option overrides it.
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('body is not JSON')),
      text: () => Promise.resolve('<html><body><p>Ship it.</p></body></html>'),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: new Headers({ 'content-type': 'application/json' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'get-page-content', { pageId: '1-p1', format: 'html' });
    const result = await waitForType('tool_result');

    expect(result.error).toBeUndefined();
    expect((result.result as any).content).toBe('<html><body><p>Ship it.</p></body></html>');
  });

  it('get-page-content returns raw HTML on request', async () => {
    const fetchMock = vi.fn(async () => htmlResponse('<html><body><p>Ship it.</p></body></html>'));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'get-page-content', { pageId: '1-p1', format: 'html' });
    const result = await waitForType('tool_result');

    const payload = result.result as Record<string, unknown>;
    expect(payload.format).toBe('html');
    expect(payload.content).toBe('<html><body><p>Ship it.</p></body></html>');
    expect(payload.note).toBeUndefined();
  });

  it('create-page sends a well-formed multipart request', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: '1-p9', title: 'Q3 Notes', parentSection: { id: '1-s1' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'create-page', {
      parentSectionId: '1-s1',
      title: 'Q3 Notes',
      content: '# Goals\n\n- Ship **it**',
    });
    const result = await waitForType('tool_result');

    const payload = result.result as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect((payload.page as any).id).toBe('1-p9');

    const call = graphCall(fetchMock, (u) => u.endsWith('/sections/1-s1/pages'));
    expect(call).toBeDefined();
    const init = call?.[1] as RequestInit;
    expect(init.method).toBe('POST');

    // The caller's content type must survive the client's application/json
    // default, or Graph rejects the body it was actually sent.
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=.+/);

    // The body must be raw bytes, not a JSON string.
    expect(Buffer.isBuffer(init.body)).toBe(true);
    const body = (init.body as Buffer).toString('utf-8');
    expect(body).toContain('Content-Disposition: form-data; name="Presentation"');
    expect(body).toContain('Content-Type: text/html');
    expect(body).toContain('\r\n');

    // The page title IS the <title> element — there is no title field.
    expect(body).toContain('<title>Q3 Notes</title>');
    // Markdown was rendered, not passed through as literal text.
    expect(body).toContain('<h1>Goals</h1>');
    expect(body).toContain('<strong>it</strong>');

    // The boundary declared in the header is the one used in the body.
    const boundary = headers['Content-Type'].replace('multipart/form-data; boundary=', '');
    expect(body.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(body.endsWith(`--${boundary}--\r\n`)).toBe(true);
  });

  it('create-page escapes the title but not the body', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: '1-p9' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'create-page', {
      sectionId: '1-s1',
      title: 'Q3 <Draft> & Notes',
      content: 'Ship **it**',
    });
    await waitForType('tool_result');

    const init = graphCall(fetchMock, (u) => u.endsWith('/pages'))?.[1] as RequestInit;
    const body = (init.body as Buffer).toString('utf-8');

    expect(body).toContain('<title>Q3 &lt;Draft&gt; &amp; Notes</title>');
    // The body is generated markup: escaping it would print literal tags.
    expect(body).toContain('<strong>it</strong>');
    expect(body).not.toContain('&lt;strong&gt;');
  });

  it('create-page passes HTML content through unconverted', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: '1-p9' }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'create-page', {
      sectionId: '1-s1',
      title: 'T',
      // Not a well-formed HTML block: marked returns those unchanged, so a
      // `<table>…</table>` fixture would pass whether or not contentFormat
      // was honoured. An ampersand round-trips differently — markdown
      // renders it as &amp;, passthrough leaves it bare.
      content: 'Ana & Bob',
      contentFormat: 'html',
    });
    await waitForType('tool_result');

    const init = graphCall(fetchMock, (u) => u.endsWith('/pages'))?.[1] as RequestInit;
    const body = (init.body as Buffer).toString('utf-8');
    expect(body).toContain('<body>Ana & Bob</body>');
    expect(body).not.toContain('&amp;');
  });

  it('create-page refuses to guess a section or an empty title', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'create-page', { title: 'T', content: 'x' });
    const missingSection = await waitForType('tool_result');
    expect(String((missingSection.error as any)?.message ?? missingSection.error)).toMatch(
      /parentSectionId/,
    );

    received.length = 0;
    sendToolCall(sessionId, 'create-page', { sectionId: '1-s1', title: '  ', content: 'x' });
    const emptyTitle = await waitForType('tool_result');
    expect(String((emptyTitle.error as any)?.message ?? emptyTitle.error)).toMatch(/title/i);

    // Neither reached Graph.
    expect(graphCall(fetchMock, (u) => u.includes('/pages'))).toBeUndefined();
  });

  it('create-page refuses to default a missing content to an empty page', async () => {
    // `required` in the JSON Schema is advisory in this stack — nothing
    // validates arguments before the handler runs — so a typo'd `contnet:`
    // must not silently produce a titled, empty page with `success: true`.
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'create-page', { sectionId: '1-s1', title: 'T' });
    const result = await waitForType('tool_result');

    expect(String((result.error as any)?.message ?? result.error)).toMatch(/content/i);
    expect(graphCall(fetchMock, (u) => u.includes('/pages'))).toBeUndefined();
  });

  it('create-page does not duplicate the page when Graph throttles it', async () => {
    // Spec §8.2. This is the single most expensive failure this app can have.
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return jsonResponse({ error: { code: 'activityLimitReached' } }, 429, {
        'retry-after': '0',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'create-page', { sectionId: '1-s1', title: 'T', content: 'x' });
    const result = await waitForType('tool_result');

    expect(result.error).toBeDefined();
    expect(calls).toBe(1);
  });

  it('delete-page deletes exactly the page it was given', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 204));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    // Slash-bearing id on purpose: unencoded it addresses a different
    // resource, and this is the tool where that mistake is unrecoverable.
    sendToolCall(sessionId, 'delete-page', { pageId: '1-p/1' });
    const result = await waitForType('tool_result');

    expect((result.result as any).success).toBe(true);

    const call = graphCall(fetchMock, (u) => u.includes('/pages/'));
    expect(call?.[1]).toMatchObject({ method: 'DELETE' });
    expect(call?.[0]).toContain('/me/onenote/pages/1-p%2F1');
    expect(call?.[0]).not.toContain('/me/onenote/pages/1-p/1');
  });

  it('delete-page refuses to run without a page id', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 204));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'delete-page', { page: '1-p1' });
    const result = await waitForType('tool_result');

    expect(result.error).toBeDefined();
    // Nothing was deleted. This is the whole point of the rule.
    expect(
      fetchMock.mock.calls.filter((c: unknown[]) => (c[1] as RequestInit)?.method === 'DELETE'),
    ).toHaveLength(0);
  });

  it('copy-page-to-section polls the operation with authentication', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/copyToSection')) {
        return jsonResponse({}, 202, {
          location: 'https://graph.microsoft.com/v1.0/me/onenote/operations/op1',
        });
      }
      if (url.includes('/operations/op1')) {
        return jsonResponse({
          id: 'op1',
          status: 'Completed',
          resourceLocation: 'https://graph.microsoft.com/v1.0/me/onenote/pages/1-p2',
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'copy-page-to-section', {
      pageId: '1-p1',
      destinationSectionId: '1-s2',
    });
    const result = await waitForType('tool_result');

    const payload = result.result as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.status).toBe('Completed');
    expect(payload.newPageId).toBe('1-p2');

    const copyCall = graphCall(fetchMock, (u) => u.endsWith('/copyToSection'));
    expect(copyCall?.[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse((copyCall?.[1] as RequestInit).body as string)).toEqual({ id: '1-s2' });

    // The operation URL is a Graph resource: it needs the bearer token.
    // OneDrive's copy monitor is pre-authenticated; this one is not, and
    // copying that skipAuth here 401s on every copy.
    const pollCall = graphCall(fetchMock, (u) => u.includes('/operations/op1'));
    expect(pollCall).toBeDefined();
    const pollHeaders = (pollCall?.[1] as RequestInit).headers as Record<string, string>;
    expect(pollHeaders.Authorization).toBe('Bearer test-access-token');
  });

  it('copy-page-to-section keeps polling while the operation is running', async () => {
    let polls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/copyToSection')) {
        return jsonResponse({}, 202, {
          location: 'https://graph.microsoft.com/v1.0/me/onenote/operations/op1',
        });
      }
      if (url.includes('/operations/op1')) {
        polls += 1;
        if (polls === 1) return jsonResponse({ id: 'op1', status: 'Running' });
        return jsonResponse({
          id: 'op1',
          status: 'Completed',
          resourceLocation: 'https://graph.microsoft.com/v1.0/me/onenote/pages/1-p2',
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'copy-page-to-section', {
      pageId: '1-p1',
      destinationSectionId: '1-s2',
    });
    const result = await waitForType('tool_result', 10_000);

    expect(polls).toBe(2);
    expect((result.result as any).newPageId).toBe('1-p2');
  });

  it('copy-page-to-section surfaces a failed operation as an error', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/copyToSection')) {
        return jsonResponse({}, 202, {
          location: 'https://graph.microsoft.com/v1.0/me/onenote/operations/op1',
        });
      }
      if (url.includes('/operations/op1')) {
        return jsonResponse({
          id: 'op1',
          status: 'Failed',
          error: { code: 'accessDenied', message: 'No access to the target section.' },
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'copy-page-to-section', {
      pageId: '1-p1',
      destinationSectionId: '1-s2',
    });
    const result = await waitForType('tool_result');

    expect(result.error).toBeDefined();
    expect(String((result.error as any).message ?? result.error)).toMatch(/No access/);
  });

  it('copy-page-to-section does not report success on a Graph error', async () => {
    // responseType 'raw' bypasses the client's !response.ok check by design,
    // so the tool owns it. Without that check a 403 reads as "no Location
    // header" and the tool cheerfully returns success for a copy that never
    // happened — the most dangerous shape a bug in this app can take.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/copyToSection')) {
        return jsonResponse(
          { error: { code: 'accessDenied', message: 'No access to the target section.' } },
          403,
        );
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'copy-page-to-section', {
      pageId: '1-p1',
      destinationSectionId: '1-s2',
    });
    const result = await waitForType('tool_result');

    expect(result.error).toBeDefined();
    expect(String((result.error as any).message ?? result.error)).toMatch(/No access/);
  });

  it('copy-page-to-section reports an accepted copy with no Location header', async () => {
    // Graph is documented to return one, but a missing header must not become
    // a crash or a false "Completed" — the copy really was accepted.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/copyToSection')) return jsonResponse({}, 202);
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'copy-page-to-section', {
      pageId: '1-p1',
      destinationSectionId: '1-s2',
    });
    const result = await waitForType('tool_result');

    const payload = result.result as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.status).toBe('Accepted');
    expect(payload.newPageId).toBeNull();
  });

  it('append-to-page sends a patch command array', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 204));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'append-to-page', {
      pageId: '1-p1',
      content: '## Follow-ups\n\n- Ping **Ana**',
    });
    const result = await waitForType('tool_result');

    expect((result.result as any).success).toBe(true);

    const call = graphCall(fetchMock, (u) => u.includes('/content'));
    expect(call?.[1]).toMatchObject({ method: 'PATCH' });
    expect(call?.[0]).toContain('/me/onenote/pages/1-p1/content');

    // An array, not an object. This is the mistake to expect: every other
    // body in this app is an object.
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ target: 'body', action: 'append', position: 'after' });
    expect(body[0].content).toContain('<h2>Follow-ups</h2>');
    expect(body[0].content).toContain('<strong>Ana</strong>');
  });

  it('append-to-page can target an element id from get-page-content', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 204));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'append-to-page', {
      pageId: '1-p1',
      target: 'p:{1234}{50}',
      position: 'before',
      content: 'note',
    });
    await waitForType('tool_result');

    const body = JSON.parse(
      (graphCall(fetchMock, (u) => u.includes('/content'))?.[1] as RequestInit).body as string,
    );
    expect(body[0].target).toBe('p:{1234}{50}');
    expect(body[0].position).toBe('before');
  });

  it('replace-page-content replaces the body and reports success', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 204));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    // The content carries markdown syntax on purpose. A plain string like
    // 'Rewritten.' comes out identical from `escapeHtml` and from
    // `markdownToHtmlFragment`, so it cannot tell the two branches apart —
    // inverting the title/body ternary would leave the test green.
    sendToolCall(sessionId, 'replace-page-content', {
      pageId: '1-p1',
      content: '**Rewritten**',
    });
    const result = await waitForType('tool_result');

    expect((result.result as any).success).toBe(true);

    const body = JSON.parse(
      (graphCall(fetchMock, (u) => u.includes('/content'))?.[1] as RequestInit).body as string,
    );
    expect(body[0]).toMatchObject({ target: 'body', action: 'replace' });
    // Rendered as markdown, not escaped: the body branch is the asymmetric
    // half of the pair the title test pins from the other side.
    expect(body[0].content).toContain('<strong>Rewritten</strong>');
    expect(body[0].content).not.toContain('**Rewritten**');
    // `position` is meaningless for a replace and must not be sent.
    expect(body[0].position).toBeUndefined();
  });

  it('replace-page-content escapes a replacement title', async () => {
    // Targeting `title` replaces the page heading, which is text, not markup.
    const fetchMock = vi.fn(async () => jsonResponse({}, 204));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'replace-page-content', {
      pageId: '1-p1',
      target: 'title',
      content: 'Q3 <Final> & Done',
    });
    await waitForType('tool_result');

    const body = JSON.parse(
      (graphCall(fetchMock, (u) => u.includes('/content'))?.[1] as RequestInit).body as string,
    );
    expect(body[0].target).toBe('title');
    expect(body[0].content).toBe('Q3 &lt;Final&gt; &amp; Done');
  });

  it('replace-page-content refuses to blank a page', async () => {
    // Irreversible, so an empty replacement is treated as a caller bug.
    const fetchMock = vi.fn(async () => jsonResponse({}, 204));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'replace-page-content', { pageId: '1-p1', content: '   ' });
    const result = await waitForType('tool_result');

    expect(result.error).toBeDefined();
    expect(graphCall(fetchMock, (u) => u.includes('/content'))).toBeUndefined();
  });

  it('both editing tools refuse to guess a page', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 204));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'append-to-page', { content: 'x' });
    expect((await waitForType('tool_result')).error).toBeDefined();

    received.length = 0;
    sendToolCall(sessionId, 'replace-page-content', { content: 'x' });
    expect((await waitForType('tool_result')).error).toBeDefined();

    expect(graphCall(fetchMock, (u) => u.includes('/content'))).toBeUndefined();
  });

  it('search-pages uses $search and shapes the results', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        value: [{ id: '1-p1', title: 'Standup notes', parentSection: { id: '1-s1' } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'search-pages', { query: 'standup' });
    const result = await waitForType('tool_result');

    const payload = result.result as Record<string, unknown>;
    expect(payload.searchMethod).toBe('search');
    expect(payload.count).toBe(1);
    expect((payload.pages as any[])[0].title).toBe('Standup notes');
    expect(payload.success).toBeUndefined();

    const call = graphCall(fetchMock, (u) => u.includes('$search'));
    expect(call?.[0]).toContain(`$search=${encodeURIComponent('standup')}`);
    expect(call?.[0]).toContain('$expand=parentSection');
  });

  it('search-pages falls back to a title filter when $search is unsupported', async () => {
    let searchTried = false;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('$search')) {
        searchTried = true;
        return jsonResponse(
          { error: { code: 'BadRequest', message: '$search not supported' } },
          400,
        );
      }
      return jsonResponse({ value: [{ id: '1-p1', title: "Bob's notes" }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'search-pages', { query: "Bob's notes" });
    const result = await waitForType('tool_result');

    const payload = result.result as Record<string, unknown>;
    expect(searchTried).toBe(true);
    expect(payload.searchMethod).toBe('filter');
    expect(payload.count).toBe(1);

    // The apostrophe must be doubled, or the OData literal terminates early
    // and the filter means something other than what the caller asked for.
    const filterCall = graphCall(fetchMock, (u) => u.includes('$filter'));
    expect(filterCall).toBeDefined();
    expect(decodeURIComponent(filterCall?.[0] as string)).toContain(
      "contains(title,'Bob''s notes')",
    );
  });

  it('search-pages returns an explained empty result when both paths fail', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: 'BadRequest', message: 'not supported' } }, 400),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'search-pages', { query: 'anything' });
    const result = await waitForType('tool_result');

    // An error would teach the agent that search is broken; an explained empty
    // result lets it fall back to list-pages.
    expect(result.error).toBeUndefined();
    const payload = result.result as Record<string, unknown>;
    expect(payload.searchMethod).toBe('none');
    expect(payload.count).toBe(0);
    expect(String(payload.note)).toMatch(/list-pages/);

    // Both steps of the degradation must actually be attempted. Asserting only
    // on the payload cannot tell "tried $search, then $filter, then gave up"
    // from "gave up after $search" — they produce identical results, so a
    // future edit collapsing the two-step fallback would go unnoticed.
    expect(graphCall(fetchMock, (u) => u.includes('$search'))).toBeDefined();
    expect(graphCall(fetchMock, (u) => u.includes('$filter'))).toBeDefined();
  });

  it('surfaces a dead token instead of reporting an empty search', async () => {
    // Spec §8.1: of the four auth failures only one means "reconnect your
    // account", and it must reach the agent. A bare catch turned this into
    // `searchMethod: 'none'`, so the agent would tell the user there are no
    // matching notes when the real problem was a revoked credential.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/oauth2/')) return jsonResponse({ error: 'invalid_grant' }, 400);
      return jsonResponse({ error: { code: 'InvalidAuthenticationToken' } }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'search-pages', { query: 'anything' });
    const result = await waitForType('tool_result');

    expect(result.error).toBeDefined();
    expect(String((result.error as any).message ?? result.error)).toMatch(/reconnect/i);
  });

  it('search-pages requires a query', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ value: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    sendToolCall(sessionId, 'search-pages', {});
    const result = await waitForType('tool_result');

    expect(result.error).toBeDefined();
    expect(graphCall(fetchMock, () => true)).toBeUndefined();
  });

  it('registers all 15 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'append-to-page',
      'copy-page-to-section',
      'create-notebook',
      'create-page',
      'create-section',
      'delete-page',
      'get-notebook',
      'get-page',
      'get-page-content',
      'list-notebooks',
      'list-pages',
      'list-section-groups',
      'list-sections',
      'replace-page-content',
      'search-pages',
    ]);
  });

  it('declares all four annotations on every tool', async () => {
    // CLAUDE.md: annotations are declarative, with no inference heuristic. A
    // tool that omits one gets whatever the SDK defaults to, which is exactly
    // the silent behaviour that rule exists to prevent.
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string; annotations?: Record<string, unknown> }>;

    // Without this, an empty tool list would satisfy the loop below and the
    // test would pass while asserting nothing — the exact failure mode it
    // exists to catch.
    expect(tools).toHaveLength(15);

    for (const tool of tools) {
      expect(tool.annotations, `${tool.name} has no annotations`).toBeDefined();
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) {
        expect(typeof tool.annotations?.[hint], `${tool.name} does not declare ${hint}`).toBe(
          'boolean',
        );
      }
    }
  });

  it('marks exactly the two irreversible tools as destructive', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string; annotations?: Record<string, unknown> }>;

    // destructiveHint means irreversible, not merely mutating (spec §3.4).
    const destructive = tools
      .filter((t) => t.annotations?.destructiveHint === true)
      .map((t) => t.name)
      .sort();

    expect(destructive).toEqual(['delete-page', 'replace-page-content']);
  });
});
