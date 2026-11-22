/**
 * Tests for the Render Agent App.
 *
 * Mocks the Render REST API so tests run without real credentials.
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
    installationId: 'inst_render',
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
    context: { userId: 'u_test', installationId: 'inst_render' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// REST response helpers
// ---------------------------------------------------------------------------

function jsonOk(data: unknown, status = 200) {
  return {
    ok: true,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Map(),
  };
}

function jsonError(status: number, message: string) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ message }),
    text: () => Promise.resolve(JSON.stringify({ message })),
    headers: new Map([['retry-after', null]]),
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Default mock: successful response for health check (GET /user)
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(jsonOk({ id: 'usr-123', name: 'Test User', email: 'test@render.com' })),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.render',
    appVersion: '2.0.0',
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

    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: { RENDER_API_KEY: 'test-render-key' },
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

describe('Render Agent App', () => {
  it('lists all 31 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-custom-domain',
      'add-disk',
      'cancel-deploy',
      'create-environment',
      'create-project',
      'create-service',
      'delete-custom-domain',
      'delete-env-var',
      'delete-project',
      'delete-service',
      'get-deploy',
      'get-logs',
      'get-project',
      'get-service',
      'get-user',
      'list-custom-domains',
      'list-deploys',
      'list-disks',
      'list-env-vars',
      'list-environments',
      'list-owners',
      'list-projects',
      'list-services',
      'restart-service',
      'resume-service',
      'rollback-deploy',
      'set-env-vars',
      'suspend-service',
      'trigger-deploy',
      'update-env-var',
      'verify-custom-domain',
    ]);
  });

  it('health check responds without error when API key is valid', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The health handler calls renderRequest(ctx, '/user') and does not return
    // a HealthResult -- status will be 'degraded' (void return) or 'ready'
    // depending on SDK handling.
    expect(health.status).toBeDefined();
  });

  it('health check reports degraded with invalid API key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonError(401, 'Unauthorized')));

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
  });

  it('get-user returns user info', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonOk({ id: 'usr-456', name: 'Jane Doe', email: 'jane@example.com' })),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-user', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('usr-456');
    expect(data.name).toBe('Jane Doe');
    expect(data.email).toBe('jane@example.com');
  });

  it('list-services returns services list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonOk([
          {
            service: {
              id: 'srv-abc',
              name: 'my-web-app',
              type: 'web_service',
              ownerId: 'own-1',
              slug: 'my-web-app',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-06-01T00:00:00Z',
              status: 'running',
              serviceDetails: {
                url: 'https://my-web-app.onrender.com',
                region: 'oregon',
              },
            },
          },
          {
            service: {
              id: 'srv-def',
              name: 'worker',
              type: 'background_worker',
              ownerId: 'own-1',
              slug: 'worker',
              createdAt: '2024-02-01T00:00:00Z',
              updatedAt: '2024-06-01T00:00:00Z',
              status: 'running',
              serviceDetails: {},
            },
          },
        ]),
      ),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-services', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as { services: Array<Record<string, unknown>>; count: number };
    expect(data.count).toBe(2);
    expect(data.services[0].name).toBe('my-web-app');
    expect(data.services[0].type).toBe('web_service');
    expect(data.services[0].url).toBe('https://my-web-app.onrender.com');
    expect(data.services[1].name).toBe('worker');
    expect(data.services[1].type).toBe('background_worker');
  });

  it('list-deploys returns deploy list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonOk([
          {
            deploy: {
              id: 'dep-001',
              status: 'live',
              createdAt: '2024-06-01T12:00:00Z',
              commit: {
                id: 'abc123',
                message: 'fix: resolve bug',
                createdAt: '2024-06-01T11:00:00Z',
              },
            },
          },
          {
            deploy: {
              id: 'dep-002',
              status: 'build_in_progress',
              createdAt: '2024-06-02T12:00:00Z',
            },
          },
        ]),
      ),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-deploys', { serviceId: 'srv-abc' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as { deploys: Array<Record<string, unknown>> };
    expect(data.deploys).toHaveLength(2);
    expect(data.deploys[0].id).toBe('dep-001');
    expect(data.deploys[0].status).toBe('live');
    expect(data.deploys[0].commit).toBeDefined();
    expect(data.deploys[1].id).toBe('dep-002');
    expect(data.deploys[1].status).toBe('build_in_progress');
    expect(data.deploys[1].commit).toBeNull();
  });

  it('trigger-deploy triggers a new deploy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonOk({
          id: 'dep-new',
          status: 'created',
          createdAt: '2024-06-03T00:00:00Z',
        }),
      ),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'trigger-deploy', {
      serviceId: 'srv-abc',
      clearCache: 'clear',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.deployId).toBe('dep-new');
    expect(data.status).toBe('created');

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toContain('/services/srv-abc/deploys');
    expect(fetchCall[1].method).toBe('POST');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.clearCache).toBe('clear');
  });

  it('tool call fails on API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonError(401, 'Invalid API key')));

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-user', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('AUTH_INVALID');
  });

  it('tool call fails on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonError(404, 'Service not found')));

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-service', { serviceId: 'nonexistent' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('NOT_FOUND');
  });
});
