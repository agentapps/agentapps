/**
 * Test harness for the Slack Agent App.
 *
 * Runs the app in-process behind the real station AppStation, so tests take the same
 * protocol path as the CLI and MCP clients. The host side answers secret requests from
 * the mutable `installationSecrets` / `systemSecrets` objects (tests can delete a key to
 * exercise the missing-secret paths).
 *
 * The app talks to Slack through `@slack/web-api`'s `WebClient`, which sends every call
 * (API methods and the upload of file bytes) through one method, `makeRequest(url, body,
 * headers)`. The harness replaces that method, once and for good, with a recorder that
 * answers from the queue a test set with `mockSlack()`. Everything above it is the real
 * SDK: the method bindings (`client.chat.postMessage`), the `files.uploadV2` flow and the
 * `ok: false` to error conversion. So a tool that calls a method the SDK does not have
 * fails here as it would in production, and a request nobody queued fails the test.
 * `fetch` is replaced too: the app must never use it.
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { WebClient } from '@slack/web-api';
import { afterEach, beforeEach, vi } from 'vitest';
import { factory } from '../src/app.js';

export type Message = Record<string, unknown>;
export type ToolInfo = { name: string; annotations?: Record<string, unknown> };

export const USER_TOKEN = 'xoxp-fake-user-token';
export const BOT_TOKEN = 'xoxb-fake-bot-token';

/** One request the app sent to Slack. */
export interface SlackRequest {
  /** The full URL: `https://slack.com/api/<method>`, or the upload URL for file bytes. */
  url: string;
  /** The Web API method (`chat.postMessage`), or the URL itself when it is not an API call. */
  method: string;
  /** The arguments, without the keys the SDK leaves undefined. */
  body: Record<string, unknown>;
  /** Which token signed it. */
  token: 'user' | 'bot' | string;
}

/** A queued answer: a Slack response body (`{ ok: true, ... }`), or an error to throw. */
export type SlackReply = Record<string, unknown> | Error;

let queue: SlackReply[] = [];
/** Every request the app sent in the current test, in order. */
export let slackRequests: SlackRequest[] = [];

const API_BASE = 'https://slack.com/api/';

// The single point where the SDK would touch the network. Never restored: a cached client
// must not be able to reach Slack from a test, whatever a test forgets to queue.
(WebClient.prototype as unknown as Record<string, unknown>).makeRequest = async function (
  this: WebClient,
  url: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const sent: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body ?? {})) {
    if (value !== undefined) sent[key] = value;
  }
  const token = this.token === USER_TOKEN ? 'user' : this.token === BOT_TOKEN ? 'bot' : this.token;
  const method = url.startsWith(API_BASE) ? url.slice(API_BASE.length) : url;
  slackRequests.push({ url, method, body: sent, token: token ?? '' });

  const reply = queue.shift();
  if (reply === undefined) throw new Error(`unexpected Slack request in test: ${method}`);
  if (reply instanceof Error) throw reply;
  return {
    status: 200,
    // The SDK adds `response_metadata` to the body it is given: hand it a copy.
    data: structuredClone(reply),
    headers: {},
    request: { path: new URL(url).pathname },
  };
};

/** Answers the next Slack requests with these replies, in order; anything beyond fails. */
export function mockSlack(...replies: SlackReply[]): void {
  queue = [...replies];
}

/** The request Slack rejects with `ok: false` and this error code, as the real API answers. */
export function slackError(error: string, extra: Record<string, unknown> = {}): SlackReply {
  return { ok: false, error, ...extra };
}

/** Replies queued and not consumed: a test that expects N requests can assert it is 0. */
export function pendingReplies(): number {
  return queue.length;
}

let appStation: AppStation;
let host: Transport;
let received: MessageBase[] = [];
let openSessionId: string | undefined;

/** Fake installation secrets the host hands to the app (never real ones). */
export let installationSecrets: Record<string, string> = {};
/** Fake system secrets (the OAuth client). */
export let systemSecrets: Record<string, string> = {};
/** The `fetch` stub of the current test: the app must never call it. */
export let fetchMock = vi.fn();

beforeEach(() => {
  openSessionId = undefined;
  queue = [];
  slackRequests = [];
  installationSecrets = {
    ACCESS_TOKEN: USER_TOKEN,
    BOT_ACCESS_TOKEN: BOT_TOKEN,
    REFRESH_TOKEN: 'fake-refresh-token',
    TEAM_ID: 'T0123456789',
    TEAM_NAME: 'Example Workspace',
    USER_ID: 'U0123456789',
  };
  systemSecrets = {
    CLIENT_ID: 'fake-client-id',
    CLIENT_SECRET: 'fake-client-secret',
  };
  fetchMock = vi.fn().mockRejectedValue(new Error('unexpected fetch in test'));
  vi.stubGlobal('fetch', fetchMock);

  appStation = new AppStation({
    appId: 'app.slack',
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
        secrets: systemSecrets,
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

/** The error message of a failed `tool_result`, or '' when it succeeded. */
export function errorOf(res: Message): string {
  return (res.error as { message: string } | undefined)?.message ?? '';
}
