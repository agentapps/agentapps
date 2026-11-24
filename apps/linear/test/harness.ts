/**
 * Test harness for the Linear Agent App.
 *
 * Runs the app in-process behind the real station AppStation, so tests take the same
 * protocol path as the CLI and MCP clients. The host side answers secret requests from
 * the mutable `installationSecrets` object (tests can delete `API_KEY` to exercise the
 * missing-secret paths).
 *
 * The app talks to Linear through `@linear/sdk`, which sends every GraphQL document with
 * the global `fetch` it captured when the module was first loaded. So the harness puts a
 * stable delegating `fetch` on `globalThis` before anything else is imported, and each
 * test points it at its own mock with `mockGraphQL()`. A request for an operation a test
 * did not answer fails with "unexpected fetch in test".
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, vi } from 'vitest';
import { factory } from '../src/app.js';

type FetchImpl = (url: unknown, init?: RequestInit) => Promise<Response>;

const fetchHolder = vi.hoisted(() => {
  const unexpected: (url: unknown, init?: RequestInit) => Promise<Response> = () =>
    Promise.reject(new Error('unexpected fetch in test'));
  const holder = { impl: unexpected, unexpected };
  // Installed before `@linear/sdk` loads: the SDK keeps the `fetch` it finds at import time.
  globalThis.fetch = ((url: unknown, init?: RequestInit) => holder.impl(url, init)) as typeof fetch;
  return holder;
});

export type Message = Record<string, unknown>;
export type ToolInfo = { name: string; annotations?: Record<string, unknown> };

/** One GraphQL request the app sent. */
export interface GraphQLCall {
  /** The operation name of the document (`issue`, `updateIssue`, `team_members`...). */
  operation: string;
  kind: 'query' | 'mutation';
  variables: Record<string, unknown>;
  query: string;
  url: string;
  method: string;
  headers: Record<string, string>;
}

/** What a test answers for one operation: the `data` object, or a full Response. */
export type GraphQLAnswer =
  | Record<string, unknown>
  | Response
  | ((variables: Record<string, unknown>, call: GraphQLCall) => Record<string, unknown> | Response);

let appStation: AppStation;
let host: Transport;
let received: MessageBase[] = [];
let openSessionId: string | undefined;

/** Fake installation secrets the host hands to the app (never real ones). */
export let installationSecrets: Record<string, string> = {};

/** Every GraphQL request sent since the test started, in order. */
export let calls: GraphQLCall[] = [];

beforeEach(() => {
  openSessionId = undefined;
  installationSecrets = { API_KEY: 'lin_api_fake_key_for_tests' };
  calls = [];
  fetchHolder.impl = fetchHolder.unexpected;

  appStation = new AppStation({
    appId: 'app.linear',
    appVersion: '3.0.1',
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
  fetchHolder.impl = fetchHolder.unexpected;
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

const waitForType = (type: string, timeoutMs?: number) =>
  waitFor((m) => m.type === type, timeoutMs);

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
export async function callTool(
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = 3000,
): Promise<Message> {
  openSessionId ??= await initAndOpen();
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId: openSessionId,
    tool,
    arguments: args,
    context: { userId: 'u_test', installationId: 'inst_test' },
  } as MessageBase);
  return waitForType('tool_result', timeoutMs);
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

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A GraphQL error answer, shaped like Linear's (HTTP status plus `errors[].extensions`). */
export function graphqlError(
  status: number,
  message: string,
  type: string,
  userPresentableMessage?: string,
): Response {
  return jsonResponse(
    {
      errors: [
        {
          message,
          extensions: {
            type,
            userError: status < 500,
            ...(userPresentableMessage ? { userPresentableMessage } : {}),
          },
        },
      ],
    },
    status,
  );
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/**
 * Answers GraphQL requests by operation name. Each answer is the `data` object of the
 * response (or a function of the variables, or a whole Response for error cases). A
 * list of answers is used in order, the last one repeating. Any other operation fails.
 */
export function mockGraphQL(answers: Record<string, GraphQLAnswer | GraphQLAnswer[]>): void {
  const used: Record<string, number> = {};
  fetchHolder.impl = async (url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      query?: string;
      variables?: Record<string, unknown>;
    };
    const query = body.query ?? '';
    const match = /^\s*(query|mutation)\s+(\w+)/.exec(query);
    const call: GraphQLCall = {
      operation: match?.[2] ?? '(anonymous)',
      kind: (match?.[1] as 'query' | 'mutation') ?? 'query',
      variables: body.variables ?? {},
      query,
      url: String(url),
      method: String(init?.method),
      headers: headersOf(init),
    };
    calls.push(call);
    const entry = answers[call.operation];
    if (entry === undefined) {
      throw new Error(`unexpected fetch in test: ${call.kind} ${call.operation}`);
    }
    let answer: GraphQLAnswer;
    if (Array.isArray(entry)) {
      const n = used[call.operation] ?? 0;
      used[call.operation] = n + 1;
      answer = entry[Math.min(n, entry.length - 1)] as GraphQLAnswer;
    } else {
      answer = entry;
    }
    const value = typeof answer === 'function' ? answer(call.variables, call) : answer;
    return value instanceof Response ? value : jsonResponse({ data: value });
  };
}

/** Makes every request fail the way an unreachable host does. */
export function mockNetworkFailure(message: string): void {
  fetchHolder.impl = async (url, init) => {
    calls.push({
      operation: '(network failure)',
      kind: 'query',
      variables: {},
      query: '',
      url: String(url),
      method: String(init?.method),
      headers: headersOf(init),
    });
    throw new TypeError(message);
  };
}

/** The calls for one operation, in order. */
export const callsOf = (operation: string): GraphQLCall[] =>
  calls.filter((c) => c.operation === operation);
