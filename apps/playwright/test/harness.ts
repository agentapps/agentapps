/**
 * Test harness for the Playwright Agent App.
 *
 * Runs the app in-process behind the real station AppStation, so tests take the same
 * protocol path as the CLI and MCP clients. The app has no auth, so the host side only
 * answers the Objects requests (`ctx.objects.put` and `ctx.objects.link`), recording each
 * one in `objectPuts` and `objectLinks`. `fetch` is replaced with a stub that rejects, so
 * any network request fails the test.
 *
 * The test file that imports this harness must mock the `playwright` module first
 * (`vi.mock('playwright', ...)` with `./fake-playwright.js`): the harness loads the app,
 * and the app must never see the real browser library.
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
import { closeBrowser, consoleMessages, networkRequests } from '../src/browser.js';
import { resetFake } from './fake-playwright.js';

export type Message = Record<string, unknown>;
export type ToolInfo = { name: string; annotations?: Record<string, unknown> };

/** One `ctx.objects.put()` the app made, with the content decoded from base64. */
export type ObjectPut = {
  objectId: string;
  content: Buffer;
  contentType: string;
  filename?: string;
};

let appStation: AppStation;
let host: Transport;
let received: MessageBase[] = [];
let openSessionId: string | undefined;

/** Every object the app stored during the test. */
export let objectPuts: ObjectPut[] = [];
/** Every signed link the app asked for during the test. */
export let objectLinks: Array<{ objectId: string; expiresIn: number }> = [];

/** The link the fake host returns for an object. */
export const linkOf = (objectId: string) =>
  `https://station.example.com/objects/${objectId}?sig=fake`;

beforeEach(() => {
  openSessionId = undefined;
  objectPuts = [];
  objectLinks = [];
  resetFake();
  // The app never calls fetch; if it ever does, the test fails.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unexpected fetch in test')));

  appStation = new AppStation({
    appId: 'app.playwright',
    appVersion: '1.0.2',
    runtime: new InProcessRuntime(factory),
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = [];
  host.onMessage((msg) => {
    received.push(msg);
    const m = msg as Message;
    const requestId = (m.requestId as string) ?? (m.id as string);
    if (m.type === 'get_installation_secrets' || m.type === 'get_system_secrets') {
      host.send({
        ...createEnvelope(
          m.type === 'get_system_secrets' ? 'system_secrets' : 'installation_secrets',
          m.sessionId as string,
        ),
        id: requestId,
        requestId,
        secrets: {},
      } as MessageBase);
    }
    if (m.type === 'object_put') {
      const objectId = `obj_${objectPuts.length + 1}`;
      const content = Buffer.from(m.data as string, 'base64');
      objectPuts.push({
        objectId,
        content,
        contentType: m.contentType as string,
        ...(m.filename !== undefined ? { filename: m.filename as string } : {}),
      });
      host.send({
        ...createEnvelope('object_put_result', m.sessionId as string),
        id: requestId,
        requestId,
        success: true,
        objectId,
        url: `https://station.example.com/objects/${objectId}`,
        size: content.length,
        contentType: m.contentType,
        visibility: 'private',
        createdAt: '2026-01-01T00:00:00.000Z',
      } as MessageBase);
    }
    if (m.type === 'object_link') {
      objectLinks.push({ objectId: m.objectId as string, expiresIn: m.expiresIn as number });
      host.send({
        ...createEnvelope('object_link_result', m.sessionId as string),
        id: requestId,
        requestId,
        success: true,
        url: linkOf(m.objectId as string),
        expiresAt: '2026-01-01T01:00:00.000Z',
      } as MessageBase);
    }
  });
  appStation.accept(ctrlSide);
});

afterEach(async () => {
  // The app keeps its browser, page and buffers in module state: drop them between tests.
  await closeBrowser().catch(() => {});
  consoleMessages.length = 0;
  networkRequests.length = 0;
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

/** The error message of a failed `tool_result`. */
export const errorText = (result: Message) =>
  String((result.error as { message?: string } | undefined)?.message);
