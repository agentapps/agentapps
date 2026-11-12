/**
 * Integration tests for the Context7 Agent App — migrated from mca.context7 tools.test.ts.
 *
 * Uses the InProcessRuntime harness (same pattern as elevenlabs.test.ts) to
 * exercise the full protocol: initialize -> session_open -> tool_call -> tool_result.
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
import factory from '../src/app.js';

// ---------------------------------------------------------------------------
// Test harness (identical pattern to elevenlabs reference)
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
    installationId: 'inst_context7',
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
    context: { userId: 'u_test', installationId: 'inst_context7' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

/** Controls what installation secrets the host returns. Override per-test before initAndOpen(). */
let installationSecrets: Record<string, string>;

beforeEach(() => {
  installationSecrets = { CONTEXT7_API_KEY: 'ctx7sk-test' };

  // Default fetch stub — returns a valid Context7 search response
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: '/foo/bar',
              title: 'Foo',
              description: '',
              snippetsCount: 100,
              reputation: 'High',
              benchmarkScore: 80,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.context7',
    appVersion: '2.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  // Auto-respond to secret requests (reads `installationSecrets` at call time)
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
        secrets: installationSecrets,
      } as MessageBase);
    }

    if (type === 'get_system_secrets') {
      host.send({
        ...createEnvelope('system_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: {},
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

describe('Context7 Agent App', () => {
  it('lists both tools (resolve-library and get-docs)', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual(['get-docs', 'resolve-library']);
  });

  it('health check reports ready with API key', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('resolve-library returns candidates with structuredContent', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'resolve-library', { libraryName: 'foo' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.candidates).toBeDefined();
    expect(Array.isArray(data.candidates)).toBe(true);
    const candidates = data.candidates as Array<Record<string, unknown>>;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe('/foo/bar');
    expect(data.cached).toBe(false);
    expect(data.resolvedFrom).toBe('user');
  });

  it('resolve-library reports resolvedFrom anonymous when no key', async () => {
    // Clear the API key so the handler returns empty secrets
    installationSecrets = {};

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'resolve-library', { libraryName: 'foo' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.resolvedFrom).toBe('anonymous');
  });

  it('resolve-library rejects empty libraryName', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'resolve-library', { libraryName: '' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  it('get-docs returns structured snippets array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            codeSnippets: [
              {
                codeTitle: 'useEffect',
                codeId: 'src://useEffect.md',
                codeDescription: 'desc',
                codeLanguage: 'ts',
                codeList: [{ language: 'ts', code: 'useEffect(() => {}, []);' }],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-docs', { libraryId: '/x/y', query: 'useEffect' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const snippets = data.snippets as Array<Record<string, unknown>>;
    expect(snippets).toHaveLength(1);
    expect(snippets[0].code).toContain('useEffect');
    expect(snippets[0].language).toBe('ts');
    expect(data.totalReturned).toBe(1);
  });

  it('get-docs honors limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            codeSnippets: Array.from({ length: 5 }, (_v, i) => ({
              codeTitle: `t${i}`,
              codeId: `s${i}`,
              codeDescription: `d${i}`,
              codeList: [{ language: 'ts', code: `c${i}` }],
            })),
          }),
          { status: 200 },
        ),
      ),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-docs', { libraryId: '/x/y', query: 'foo', limit: 2 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.totalReturned).toBe(2);
  });

  it('get-docs rejects empty libraryId', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-docs', { libraryId: '', query: 'q' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  it('get-docs rejects empty query', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-docs', { libraryId: '/x', query: '' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });
});
