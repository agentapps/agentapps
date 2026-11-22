/**
 * Tests for the Sentry Agent App.
 *
 * Mocks the Sentry API so tests run without real credentials.
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
// Test harness
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
    installationId: 'inst_sentry',
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
    context: { userId: 'u_test', installationId: 'inst_sentry' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.sentry',
    appVersion: '1.0.0',
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
        secrets: { API_KEY: 'test-sentry-key', ORGANIZATION: 'test-org' },
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

describe('Sentry Agent App', () => {
  it('lists all 15 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'assign-issue',
      'create-release',
      'get-event',
      'get-issue',
      'get-project',
      'get-release',
      'ignore-issue',
      'list-alerts',
      'list-events',
      'list-issues',
      'list-organizations',
      'list-projects',
      'list-releases',
      'list-teams',
      'resolve-issue',
    ]);
  });

  it('health check reports ready with API key', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('list-organizations returns mapped data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: '1', slug: 'acme', name: 'Acme Corp', dateCreated: '2024-01-01' },
            { id: '2', slug: 'test', name: 'Test Org', dateCreated: '2024-06-01' },
          ]),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-organizations', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0].slug).toBe('acme');
    expect(data[1].name).toBe('Test Org');
  });

  it('list-projects returns projects for organization', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'p1',
              slug: 'web-app',
              name: 'Web App',
              platform: 'javascript',
              dateCreated: '2024-01-01',
              firstEvent: '2024-01-02',
              hasAccess: true,
            },
          ]),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-projects', { organization: 'acme' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0].slug).toBe('web-app');
    expect(data[0].platform).toBe('javascript');
  });

  it('list-issues returns issues with filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'i1',
              shortId: 'WEB-1',
              title: 'TypeError: null is not an object',
              culprit: 'app.main',
              level: 'error',
              status: 'unresolved',
              count: '42',
              userCount: 5,
              firstSeen: '2024-07-01',
              lastSeen: '2024-07-25',
              project: { slug: 'web-app' },
              platform: 'javascript',
              type: 'error',
              permalink: 'https://sentry.io/...',
            },
          ]),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-issues', { project: 'web-app' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0].shortId).toBe('WEB-1');
    expect(data[0].title).toBe('TypeError: null is not an object');
  });

  it('get-issue returns detailed issue information', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'i1',
            shortId: 'WEB-1',
            title: 'TypeError',
            culprit: 'app.main',
            level: 'error',
            status: 'unresolved',
            count: '10',
            userCount: 3,
            firstSeen: '2024-07-01',
            lastSeen: '2024-07-25',
            project: { slug: 'web-app' },
            platform: 'javascript',
            type: 'error',
            metadata: {},
            annotations: [],
            assignedTo: null,
            isSubscribed: false,
            hasSeen: true,
            permalink: 'https://sentry.io/issues/i1/',
          }),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-issue', { issueId: 'i1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.shortId).toBe('WEB-1');
    expect(data.permalink).toBe('https://sentry.io/issues/i1/');
  });

  it('get-event extracts stack trace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            eventID: 'evt1',
            id: 'evt1',
            title: 'TypeError',
            message: 'null is not an object',
            dateCreated: '2024-07-25',
            user: { id: 'u1' },
            tags: [{ key: 'level', value: 'error' }],
            platform: 'javascript',
            sdk: {},
            contexts: {},
            entries: [
              {
                type: 'exception',
                data: {
                  values: [
                    {
                      type: 'TypeError',
                      value: 'null is not an object',
                      stacktrace: {
                        frames: [
                          {
                            filename: 'app.js',
                            function: 'main',
                            lineNo: 42,
                            colNo: 10,
                            context: null,
                            inApp: true,
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              {
                type: 'breadcrumbs',
                data: {
                  values: [
                    { category: 'navigation', message: '/home', timestamp: '2024-07-25T10:00:00' },
                  ],
                },
              },
            ],
          }),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-event', {
      organization: 'test-org',
      project: 'web-app',
      eventId: 'evt1',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.eventID).toBe('evt1');

    const stackTrace = data.stackTrace as Array<Record<string, unknown>>;
    expect(stackTrace).toHaveLength(1);
    expect(stackTrace[0].type).toBe('TypeError');

    const frames = stackTrace[0].stacktrace as Array<Record<string, unknown>>;
    expect(frames).toHaveLength(1);
    expect((frames[0] as Record<string, unknown>).function).toBe('main');

    const breadcrumbs = data.breadcrumbs as Array<Record<string, unknown>>;
    expect(breadcrumbs).toHaveLength(1);
  });

  it('resolve-issue marks issue as resolved', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'i1', status: 'resolved' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'resolve-issue', { issueId: 'i1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.resolved).toBe(true);
    expect(data.status).toBe('resolved');

    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toContain('/issues/i1/');
    expect(fetchCall[1].method).toBe('PUT');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.status).toBe('resolved');
  });

  it('ignore-issue marks issue as ignored', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'i1', status: 'ignored' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'ignore-issue', { issueId: 'i1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.ignored).toBe(true);
    expect(data.status).toBe('ignored');

    const fetchCall = fetchMock.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.status).toBe('ignored');
  });

  it('assign-issue sends assignedTo in PUT body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'i1', assignedTo: { email: 'dev@example.com' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'assign-issue', { issueId: 'i1', assignedTo: 'dev@example.com' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.assigned).toBe(true);

    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toContain('/issues/i1/');
    expect(fetchCall[1].method).toBe('PUT');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.assignedTo).toBe('dev@example.com');
  });

  it('fails on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid auth token'),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-organizations', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('401');
  });
});
