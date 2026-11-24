/**
 * Test harness for the Notion Agent App.
 *
 * Runs the app in-process behind the real station AppStation, so tests take the same
 * protocol path as the CLI and MCP clients. The host side answers secret requests from
 * the mutable `installationSecrets` / `systemSecrets` objects (tests can delete a key to
 * exercise the missing-secret paths) and records `ctx.secrets.updateInstallation()` calls
 * in `secretUpdates`. The app reaches Notion through `@notionhq/client`, which is handed a
 * wrapper around the global `fetch`: tests replace `fetch`, and an unexpected request
 * fails loudly.
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, type Mock, vi } from 'vitest';
import { factory } from '../src/app.js';

export type Message = Record<string, unknown>;
export type ToolInfo = { name: string; annotations?: Record<string, unknown> };

let appStation: AppStation;
let host: Transport;
let received: MessageBase[] = [];
let openSessionId: string | undefined;

/** Fake installation secrets the host hands to the app (never real ones). */
export let installationSecrets: Record<string, string> = {};
/** Fake system secrets (the OAuth client the app refreshes tokens with). */
export let systemSecrets: Record<string, string> = {};
/** Every `ctx.secrets.updateInstallation()` the app made, in order. */
export const secretUpdates: Array<Record<string, string>> = [];
/** `ctx.auth.refresh()` requests the host received. The app does not use it today. */
export const refresh: { calls: number } = { calls: 0 };

beforeEach(() => {
  openSessionId = undefined;
  installationSecrets = {
    ACCESS_TOKEN: 'fake-access-token',
    REFRESH_TOKEN: 'fake-refresh-token',
    EXPIRY_DATE: '2099-01-01T00:00:00.000Z',
  };
  systemSecrets = {
    CLIENT_ID: 'fake-client-id',
    CLIENT_SECRET: 'fake-client-secret',
  };
  secretUpdates.length = 0;
  refresh.calls = 0;
  // Any request a test did not queue fails with a clear message.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unexpected fetch in test')));

  appStation = new AppStation({
    appId: 'app.notion',
    appVersion: '2.0.3',
    runtime: new InProcessRuntime(factory),
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = [];
  host.onMessage((msg) => {
    received.push(msg);
    const m = msg as Message;
    const requestId = (m.requestId as string) ?? (m.id as string);
    const reply = (type: string, body: Message) =>
      host.send({
        ...createEnvelope(type, m.sessionId as string),
        id: requestId,
        requestId,
        ...body,
      } as MessageBase);
    if (m.type === 'get_installation_secrets') {
      reply('installation_secrets', { secrets: installationSecrets });
    }
    if (m.type === 'get_system_secrets') reply('system_secrets', { secrets: systemSecrets });
    if (m.type === 'update_installation_secrets') {
      const update = m.secrets as Record<string, string>;
      secretUpdates.push(update);
      Object.assign(installationSecrets, update);
      reply('update_installation_secrets_response', { success: true });
    }
    if (m.type === 'refresh_token') {
      refresh.calls++;
      reply('refresh_token_response', { accessToken: '', error: 'not expected in test' });
    }
  });
  appStation.accept(ctrlSide);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await appStation.shutdown();
});

async function waitFor(predicate: (msg: Message) => boolean, timeoutMs = 5000): Promise<Message> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = received.find((m) => predicate(m as Message));
    if (found) return found as Message;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Timeout waiting for message');
}

const waitForType = (type: string) => waitFor((m) => m.type === type);

export async function initAndOpen(): Promise<string> {
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
    installationId: 'inst_test',
    tenant: { userId: 'u_test' },
  } as MessageBase);
  const opened = await waitForType('session_opened');
  received.length = 0;
  return opened.sessionId as string;
}

/** Calls a tool and returns the `tool_result` message ({ success, result | error }). */
export async function callTool(tool: string, args: Record<string, unknown>): Promise<Message> {
  openSessionId ??= await initAndOpen();
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId: openSessionId,
    tool,
    arguments: args,
    context: { userId: 'u_test', installationId: 'inst_test' },
  } as MessageBase);
  return waitForType('tool_result');
}

export async function listTools(): Promise<ToolInfo[]> {
  const sessionId = await initAndOpen();
  host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
  return (await waitForType('tools_list')).tools as ToolInfo[];
}

export async function runHealthCheck(): Promise<Message> {
  const sessionId = await initAndOpen();
  host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
  return waitForType('health_status');
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** A Notion API error body, shaped like the real ones. */
export function notionError(status: number, code: string, message: string): Response {
  return jsonResponse(
    {
      object: 'error',
      status,
      code,
      message,
      request_id: '00000000-0000-4000-8000-00000000beef',
    },
    status,
  );
}

/** Answers the next fetch calls with these responses, in order; anything beyond fails. */
export function mockFetch(...responses: Response[]): Mock {
  const fetchMock = vi.fn().mockRejectedValue(new Error('unexpected fetch in test'));
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export interface SentRequest {
  url: URL;
  method: string;
  headers: Headers;
  /** The parsed JSON body, or undefined when there is none (or it is not JSON). */
  body: any;
  rawBody: unknown;
}

/** The n-th request the app sent: URL, method, headers and parsed JSON body. */
export function requestOf(fetchMock: Mock, index = 0): SentRequest {
  const call = fetchMock.mock.calls[index] as [string | URL, RequestInit] | undefined;
  if (!call) throw new Error(`no fetch call #${index} (got ${fetchMock.mock.calls.length})`);
  const [url, init = {}] = call;
  let body: unknown;
  if (typeof init.body === 'string') {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = undefined;
    }
  }
  return {
    url: new URL(String(url)),
    method: String(init.method ?? 'GET').toUpperCase(),
    headers: new Headers(init.headers as HeadersInit),
    body,
    rawBody: init.body,
  };
}

/** `METHOD /path?query` of every request sent, in order. */
export function requestLines(fetchMock: Mock): string[] {
  return fetchMock.mock.calls.map((_, i) => {
    const { url, method } = requestOf(fetchMock, i);
    return `${method} ${url.pathname}${url.search}`;
  });
}
