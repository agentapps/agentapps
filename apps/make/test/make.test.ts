/**
 * Tests for the Make Agent App.
 *
 * Migrated from the old MCA format (bun:test + ToolContext) to the Agent Apps
 * SDK format (vitest + InProcessRuntime harness).
 *
 * Structure:
 *   1. Integration tests — boot the app via InProcessRuntime, exercise tools
 *      and health check over the protocol (tool listing, health, tool calls,
 *      error handling).
 *   2. Direct unit tests — import helpers/lib directly for fine-grained
 *      coverage (errors, url-guard, make-client serialization/parsing).
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

// -- Direct imports for unit tests --
import { extractMakeApiMessage, MakeError, makeErrorFromStatus } from '../src/lib/errors.js';
import {
  normalizeRegion,
  parseRetryAfterMs,
  serializeWebhookPayload,
} from '../src/lib/make-client.js';
import { parseMakeWebhookUrl, regionFromHost } from '../src/lib/url-guard.js';

// ============================================================================
// Test harness (same pattern as elevenlabs.test.ts)
// ============================================================================

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

async function initAndOpen(
  installationSecrets: Record<string, string> = { MAKE_API_TOKEN: 'tok-test', MAKE_REGION: 'eu1' },
): Promise<string> {
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
    installationId: 'inst_make',
    tenant: { userId: 'u_test' },
  } as MessageBase);
  const opened = await waitForType('session_opened');

  // Wire up installation-secrets auto-responder for this session's secrets.
  const sessionId = opened.sessionId as string;
  host.onMessage((msg) => {
    const m = msg as Record<string, unknown>;
    const type = m.type as string;
    const sid = m.sessionId as string;
    const requestId = (m.requestId as string) ?? (m.id as string);

    if (type === 'get_installation_secrets' && sid === sessionId) {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: installationSecrets,
      } as MessageBase);
    }
  });

  received.length = 0;
  return sessionId;
}

function sendToolCall(sessionId: string, tool: string, args: Record<string, unknown>): void {
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool,
    arguments: args,
    context: { userId: 'u_test', installationId: 'inst_make' },
  } as MessageBase);
}

// ============================================================================
// Integration tests — InProcessRuntime harness
// ============================================================================

describe('Make Agent App — integration', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{}'),
        json: () => Promise.resolve({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const runtime = new InProcessRuntime(factory);
    appStation = new AppStation({
      appId: 'app.make',
      appVersion: '2.0.0',
      runtime,
    });
    const [hostSide, ctrlSide] = createInProcessTransportPair();
    host = hostSide;
    received = collectMessages(host);
    appStation.accept(ctrlSide);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await appStation.shutdown();
  });

  // -- Tool listing --

  it('lists all 11 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'clone-scenario',
      'create-scenario',
      'delete-scenario',
      'get-scenario',
      'get-scenario-blueprint',
      'list-scenarios',
      'run-scenario',
      'start-scenario',
      'stop-scenario',
      'trigger-webhook',
      'update-scenario',
    ]);
  });

  // -- Health check --

  // NOTE: The Make app's health handler returns { status: 'ready' } on success
  // (with or without an API token). When the handler throws (e.g. 401), the SDK
  // catches the error and maps it to 'degraded'. The tests below document the
  // ACTUAL runtime behavior.

  it('health check returns ready when no token is configured (webhook-only mode)', async () => {
    const sessionId = await initAndOpen({});

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // No token means webhook-only mode. The handler returns
    // { status: 'ready' } since the app is still functional.
    expect(health.status).toBe('ready');
  });

  it('health check returns ready with valid API token (200)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"id":1}'),
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const sessionId = await initAndOpen({ MAKE_API_TOKEN: 'tok-valid', MAKE_REGION: 'eu1' });

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('health check returns ready on 403 (scoped token)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('forbidden'),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen({ MAKE_API_TOKEN: 'tok-scoped', MAKE_REGION: 'eu1' });

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('health check returns degraded on 401 (invalid token, throws)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('unauthorized'),
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen({ MAKE_API_TOKEN: 'tok-bad', MAKE_REGION: 'eu1' });

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The handler throws on 401, which the SDK catches and maps to 'degraded'.
    expect(health.status).toBe('degraded');
    expect(health.message as string).toContain('invalid');
  });

  // -- trigger-webhook tool --

  it('trigger-webhook sends POST and returns the result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('Accepted'),
        headers: new Headers({ 'content-type': 'text/plain' }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'trigger-webhook', {
      webhookUrl: 'https://hook.eu1.make.com/test-token',
      payload: { foo: 'bar' },
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.delivered).toBe(true);
    expect(data.statusCode).toBe(200);
    expect(data.webhookHost).toBe('hook.eu1.make.com');
    expect(data.region).toBe('eu1');
  });

  it('trigger-webhook rejects non-Make host (SSRF guard)', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'trigger-webhook', {
      webhookUrl: 'https://evil.com/steal',
      payload: { a: 1 },
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('BAD_REQUEST');
  });

  // -- list-scenarios tool --

  it('list-scenarios returns scenarios from the account API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              scenarios: [
                { id: 1, name: 'Scenario A', isActive: true, teamId: 7 },
                { id: 2, name: 'Scenario B', isActive: false, teamId: 7 },
              ],
              pg: { total: 2 },
            }),
          ),
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-scenarios', { teamId: '7' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const scenarios = data.scenarios as Array<Record<string, unknown>>;
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].name).toBe('Scenario A');
    expect(scenarios[1].name).toBe('Scenario B');
    expect(data.region).toBe('eu1');
  });

  it('list-scenarios fails without MAKE_API_TOKEN', async () => {
    const sessionId = await initAndOpen({});

    received.length = 0;
    sendToolCall(sessionId, 'list-scenarios', { teamId: '7' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('MAKE_API_TOKEN');
  });

  // -- Error handling: API errors surface as tool_result failures --

  it('tool call surfaces API 401 as a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('{"message":"Authorization token is invalid"}'),
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-scenarios', { teamId: '7' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('AUTH_INVALID');
  });
});

// ============================================================================
// Unit tests — MakeError
// ============================================================================

describe('MakeError', () => {
  it('prefixes message with [CODE] and preserves the literal upstream message', () => {
    const e = new MakeError('NOT_FOUND', 'Scenario 5 not found', 404);
    expect(e.message).toBe('[NOT_FOUND] Scenario 5 not found');
    expect(e.upstreamMessage).toBe('Scenario 5 not found');
    expect(e.code).toBe('NOT_FOUND');
    expect(e.status).toBe(404);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('MakeError');
  });

  it('status is optional', () => {
    const e = new MakeError('BAD_REQUEST', 'bad host');
    expect(e.status).toBeUndefined();
    expect(e.message).toBe('[BAD_REQUEST] bad host');
  });
});

describe('makeErrorFromStatus', () => {
  it.each([
    [400, 'BAD_REQUEST'],
    [401, 'AUTH_INVALID'],
    [403, 'AUTH_INVALID'],
    [404, 'NOT_FOUND'],
    [410, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
    [500, 'DEPENDENCY_UNAVAILABLE'],
    [502, 'DEPENDENCY_UNAVAILABLE'],
    [503, 'DEPENDENCY_UNAVAILABLE'],
    [418, 'UPSTREAM_ERROR'],
    [451, 'UPSTREAM_ERROR'],
  ] as const)('status %i -> code %s', (status, code) => {
    const e = makeErrorFromStatus(status, 'm');
    expect(e.code).toBe(code);
    expect(e.status).toBe(status);
    expect(e.upstreamMessage).toBe('m');
  });
});

describe('extractMakeApiMessage', () => {
  it('reads .message', () => {
    expect(extractMakeApiMessage('{"message":"boom"}', 400)).toBe('boom');
  });

  it('reads .detail', () => {
    expect(extractMakeApiMessage('{"detail":"nope"}', 400)).toBe('nope');
  });

  it('reads .error (provider 5xx / not-implemented shape)', () => {
    expect(extractMakeApiMessage('{"statusCode":501,"error":"server error"}', 501)).toBe(
      'server error',
    );
  });

  it('reads .error_description', () => {
    expect(extractMakeApiMessage('{"error_description":"token expired"}', 401)).toBe(
      'token expired',
    );
  });

  it('reads nested errors[0].message', () => {
    expect(extractMakeApiMessage('{"errors":[{"message":"bad field"}]}', 422)).toBe('bad field');
  });

  it('reads errors[0] when it is a string', () => {
    expect(extractMakeApiMessage('{"errors":["plain error"]}', 422)).toBe('plain error');
  });

  it('falls back to status + snippet on non-JSON body', () => {
    const out = extractMakeApiMessage('plain text error', 500);
    expect(out).toContain('500');
    expect(out).toContain('plain text error');
  });

  it('falls back to status-only on empty body', () => {
    expect(extractMakeApiMessage('', 500)).toBe('Make API error (500)');
    expect(extractMakeApiMessage('   ', 500)).toBe('Make API error (500)');
  });

  it('ignores empty/whitespace message fields and falls back', () => {
    const out = extractMakeApiMessage('{"message":"   "}', 503);
    expect(out).toContain('503');
  });
});

// ============================================================================
// Unit tests — url-guard
// ============================================================================

describe('parseMakeWebhookUrl — accepts valid Make webhook hosts', () => {
  it('canonical eu1 webhook', () => {
    const r = parseMakeWebhookUrl('https://hook.eu1.make.com/abc123token');
    expect(r.host).toBe('hook.eu1.make.com');
    expect(r.region).toBe('eu1');
    expect(r.url).toBe('https://hook.eu1.make.com/abc123token');
  });

  it('all four documented regions', () => {
    expect(parseMakeWebhookUrl('https://hook.eu1.make.com/t').region).toBe('eu1');
    expect(parseMakeWebhookUrl('https://hook.eu2.make.com/t').region).toBe('eu2');
    expect(parseMakeWebhookUrl('https://hook.us1.make.com/t').region).toBe('us1');
    expect(parseMakeWebhookUrl('https://hook.us2.make.com/t').region).toBe('us2');
  });

  it('host is lowercased', () => {
    expect(parseMakeWebhookUrl('https://HOOK.EU1.MAKE.COM/t').host).toBe('hook.eu1.make.com');
  });
});

describe('parseMakeWebhookUrl — SSRF host allowlist (rejects arbitrary hosts)', () => {
  it('rejects a totally unrelated host with [BAD_REQUEST]', () => {
    expect(() => parseMakeWebhookUrl('https://evil.com/steal')).toThrow(MakeError);
    try {
      parseMakeWebhookUrl('https://evil.com/steal');
    } catch (e) {
      expect((e as MakeError).code).toBe('BAD_REQUEST');
    }
  });

  it('rejects an internal/loopback host', () => {
    expect(() => parseMakeWebhookUrl('https://127.0.0.1/x')).toThrow(MakeError);
    expect(() => parseMakeWebhookUrl('https://localhost/x')).toThrow(MakeError);
    expect(() => parseMakeWebhookUrl('https://169.254.169.254/latest/meta-data')).toThrow(
      MakeError,
    );
  });

  it('rejects a suffix-spoof host (make.com is not the final label)', () => {
    expect(() => parseMakeWebhookUrl('https://hook.eu1.make.com.evil.com/t')).toThrow(MakeError);
  });

  it('rejects the userinfo @-trick (real host after @ is not make.com)', () => {
    expect(() => parseMakeWebhookUrl('https://hook.eu1.make.com@evil.com/t')).toThrow(MakeError);
  });

  it('rejects the apex make.com (no webhook subdomain)', () => {
    expect(() => parseMakeWebhookUrl('https://make.com/t')).toThrow(MakeError);
  });
});

describe('parseMakeWebhookUrl — protocol + shape guards', () => {
  it('rejects http (non-https)', () => {
    expect(() => parseMakeWebhookUrl('http://hook.eu1.make.com/t')).toThrow(MakeError);
  });

  it('rejects an explicit non-443 port', () => {
    expect(() => parseMakeWebhookUrl('https://hook.eu1.make.com:8080/t')).toThrow(MakeError);
  });

  it('accepts an explicit :443 (the default https port)', () => {
    const r = parseMakeWebhookUrl('https://hook.eu1.make.com:443/t');
    expect(r.host).toBe('hook.eu1.make.com');
    expect(r.region).toBe('eu1');
  });

  it('rejects an unparseable URL', () => {
    expect(() => parseMakeWebhookUrl('not a url at all')).toThrow(MakeError);
  });

  it('rejects empty / non-string input', () => {
    expect(() => parseMakeWebhookUrl('')).toThrow(MakeError);
    expect(() => parseMakeWebhookUrl('   ')).toThrow(MakeError);
    expect(() => parseMakeWebhookUrl(null)).toThrow(MakeError);
    expect(() => parseMakeWebhookUrl(undefined)).toThrow(MakeError);
    expect(() => parseMakeWebhookUrl(42)).toThrow(MakeError);
  });
});

describe('regionFromHost', () => {
  it('extracts the region segment', () => {
    expect(regionFromHost('hook.eu1.make.com')).toBe('eu1');
    expect(regionFromHost('hook.us2.make.com')).toBe('us2');
  });

  it('returns null for non-standard make hosts', () => {
    expect(regionFromHost('webhook.make.com')).toBeNull();
    expect(regionFromHost('eu1.make.com')).toBeNull();
  });
});

// ============================================================================
// Unit tests — make-client helpers
// ============================================================================

describe('serializeWebhookPayload', () => {
  it('object -> application/json with exact JSON body', () => {
    const { body, contentType } = serializeWebhookPayload({ hello: 'world', n: 1 });
    expect(contentType).toBe('application/json');
    expect(body).toBe(JSON.stringify({ hello: 'world', n: 1 }));
  });

  it('array -> application/json', () => {
    const { body, contentType } = serializeWebhookPayload([1, 2, 3]);
    expect(contentType).toBe('application/json');
    expect(body).toBe('[1,2,3]');
  });

  it('JSON string -> forwarded as application/json (trimmed)', () => {
    const { body, contentType } = serializeWebhookPayload('  {"a":1}  ');
    expect(contentType).toBe('application/json');
    expect(body).toBe('{"a":1}');
  });

  it('non-JSON string -> text/plain raw', () => {
    const { body, contentType } = serializeWebhookPayload('plain hello');
    expect(contentType).toBe('text/plain');
    expect(body).toBe('plain hello');
  });

  it('empty string -> empty text/plain', () => {
    const { body, contentType } = serializeWebhookPayload('');
    expect(contentType).toBe('text/plain');
    expect(body).toBe('');
  });
});

describe('normalizeRegion', () => {
  it('defaults to eu1 when empty/absent', () => {
    expect(normalizeRegion(undefined)).toBe('eu1');
    expect(normalizeRegion(null)).toBe('eu1');
    expect(normalizeRegion('')).toBe('eu1');
    expect(normalizeRegion('   ')).toBe('eu1');
  });

  it('accepts known regions case-insensitively', () => {
    expect(normalizeRegion('US1')).toBe('us1');
    expect(normalizeRegion('eu2')).toBe('eu2');
    expect(normalizeRegion(' us2 ')).toBe('us2');
  });

  it('throws [BAD_REQUEST] on an unknown region', () => {
    expect(() => normalizeRegion('mars1')).toThrow(MakeError);
    try {
      normalizeRegion('mars1');
    } catch (e) {
      expect((e as MakeError).code).toBe('BAD_REQUEST');
    }
  });
});

describe('parseRetryAfterMs', () => {
  const withHeader = (value?: string) =>
    new Response('', { status: 429, headers: value != null ? { 'retry-after': value } : {} });

  it('seconds -> ms', () => {
    expect(parseRetryAfterMs(withHeader('5'))).toBe(5000);
    expect(parseRetryAfterMs(withHeader('0'))).toBe(0);
  });

  it('clamps to 30s (a hostile/huge value cannot stall a retry)', () => {
    expect(parseRetryAfterMs(withHeader('3600'))).toBe(30_000);
  });

  it('null for absent/invalid/negative', () => {
    expect(parseRetryAfterMs(withHeader(undefined))).toBeNull();
    expect(parseRetryAfterMs(withHeader('not-a-number'))).toBeNull();
    expect(parseRetryAfterMs(withHeader('-5'))).toBeNull();
  });
});
