/**
 * Test harness for the Granola Agent App.
 *
 * Runs the app in-process behind the real station AppStation, so tests take the same
 * protocol path as the CLI and MCP clients. The host side answers secret requests from
 * the mutable `installationSecrets` object; tests can delete a key to exercise the
 * missing-secret path. `fetch` is replaced per test; an unexpected request fails loudly.
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

beforeEach(() => {
  openSessionId = undefined;
  installationSecrets = { API_KEY: 'fake-granola-key' };
  // Any request a test did not queue fails with a clear message.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unexpected fetch in test')));

  appStation = new AppStation({
    appId: 'app.granola',
    appVersion: '1.0.0',
    runtime: new InProcessRuntime(factory),
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = [];
  host.onMessage((msg) => {
    received.push(msg);
    const m = msg as Message;
    if (m.type === 'get_installation_secrets') {
      const requestId = (m.requestId as string) ?? (m.id as string);
      host.send({
        ...createEnvelope('installation_secrets', m.sessionId as string),
        id: requestId,
        requestId,
        secrets: installationSecrets,
      } as MessageBase);
    }
    if (m.type === 'get_system_secrets') {
      const requestId = (m.requestId as string) ?? (m.id as string);
      host.send({
        ...createEnvelope('system_secrets', m.sessionId as string),
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

async function waitFor(predicate: (msg: Message) => boolean, timeoutMs = 3000): Promise<Message> {
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

/** Answers the next fetch calls with these responses, in order; anything beyond fails. */
export function mockFetch(...responses: Response[]): Mock {
  const fetchMock = vi.fn().mockRejectedValue(new Error('unexpected fetch in test'));
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The URL and init of the n-th fetch call. */
export function requestOf(fetchMock: Mock, index = 0): { url: URL; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[index] as [string | URL, RequestInit];
  return { url: new URL(String(url)), init: init ?? {} };
}
