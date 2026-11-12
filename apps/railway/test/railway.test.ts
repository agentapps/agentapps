/**
 * Tests for the Railway Agent App.
 *
 * Mocks the Railway GraphQL API so tests run without real credentials.
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
    installationId: 'inst_railway',
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
    context: { userId: 'u_test', installationId: 'inst_railway' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// GraphQL response helpers
// ---------------------------------------------------------------------------

function graphqlOk(data: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
    text: () => Promise.resolve(JSON.stringify({ data })),
  };
}

function graphqlError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(message),
    json: () => Promise.resolve({ message }),
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Default mock: successful GraphQL response for validateToken (listProjects)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      graphqlOk({
        me: {
          workspaces: [
            {
              projects: {
                edges: [],
              },
            },
          ],
        },
      }),
    ),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.railway',
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
        secrets: { RAILWAY_TOKEN: 'test-railway-token' },
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

describe('Railway Agent App', () => {
  it('lists all 23 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'railway-connect-repo',
      'railway-create-domain',
      'railway-create-environment',
      'railway-create-project',
      'railway-create-service',
      'railway-create-volume',
      'railway-delete-project',
      'railway-delete-service',
      'railway-deploy-public-repo',
      'railway-get-build-logs',
      'railway-get-deploy-logs',
      'railway-get-deployment',
      'railway-get-project',
      'railway-get-user',
      'railway-list-deployments',
      'railway-list-domains',
      'railway-list-environments',
      'railway-list-projects',
      'railway-list-services',
      'railway-list-variables',
      'railway-list-workspaces',
      'railway-redeploy',
      'railway-set-variables',
    ]);
  });

  it('health check reports degraded with invalid token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(graphqlError(401, 'Unauthorized')));

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
    expect(health.message as string).toContain('invalid or expired');
  });

  it('railway-get-user returns user info', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        graphqlOk({
          me: {
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
            workspaces: [{ id: 'ws-1', name: 'My Workspace', createdAt: '2024-01-01T00:00:00Z' }],
          },
        }),
      ),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'railway-get-user', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const text = result.result as string;
    expect(text).toContain('Test User');
    expect(text).toContain('test@example.com');
    expect(text).toContain('My Workspace');
  });

  it('railway-list-projects returns projects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        graphqlOk({
          me: {
            workspaces: [
              {
                projects: {
                  edges: [
                    {
                      node: {
                        id: 'proj-1',
                        name: 'my-app',
                        description: 'My application',
                        createdAt: '2024-01-01T00:00:00Z',
                        updatedAt: '2024-06-01T00:00:00Z',
                        environments: {
                          edges: [
                            {
                              node: {
                                id: 'env-1',
                                name: 'production',
                                createdAt: '2024-01-01T00:00:00Z',
                              },
                            },
                          ],
                        },
                        services: {
                          edges: [
                            {
                              node: {
                                id: 'svc-1',
                                name: 'web',
                                createdAt: '2024-01-01T00:00:00Z',
                                updatedAt: '2024-06-01T00:00:00Z',
                              },
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        }),
      ),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'railway-list-projects', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const text = result.result as string;
    expect(text).toContain('1 project');
    expect(text).toContain('my-app');
  });

  it('railway-get-project returns project details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        graphqlOk({
          project: {
            id: 'proj-1',
            name: 'my-app',
            description: 'A web app',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-06-01T00:00:00Z',
            environments: {
              edges: [
                { node: { id: 'env-1', name: 'production', createdAt: '2024-01-01T00:00:00Z' } },
                { node: { id: 'env-2', name: 'staging', createdAt: '2024-02-01T00:00:00Z' } },
              ],
            },
            services: {
              edges: [
                {
                  node: {
                    id: 'svc-1',
                    name: 'web',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-06-01T00:00:00Z',
                  },
                },
              ],
            },
          },
        }),
      ),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'railway-get-project', { projectId: 'proj-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const text = result.result as string;
    expect(text).toContain('my-app');
    expect(text).toContain('A web app');
    expect(text).toContain('production');
    expect(text).toContain('staging');
    expect(text).toContain('web');
  });

  it('railway-list-deployments returns deployment list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        graphqlOk({
          deployments: {
            edges: [
              {
                node: {
                  id: 'dep-1',
                  status: 'SUCCESS',
                  createdAt: '2024-06-01T00:00:00Z',
                  updatedAt: '2024-06-01T00:05:00Z',
                  staticUrl: 'https://my-app.up.railway.app',
                },
              },
              {
                node: {
                  id: 'dep-2',
                  status: 'BUILDING',
                  createdAt: '2024-06-02T00:00:00Z',
                  updatedAt: '2024-06-02T00:01:00Z',
                },
              },
            ],
          },
        }),
      ),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'railway-list-deployments', {
      projectId: 'proj-1',
      serviceId: 'svc-1',
      environmentId: 'env-1',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const text = result.result as string;
    expect(text).toContain('dep-1');
    expect(text).toContain('SUCCESS');
    expect(text).toContain('dep-2');
    expect(text).toContain('BUILDING');
  });

  it('tool call fails on GraphQL API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(graphqlError(401, 'Unauthorized')));

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'railway-get-user', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('401');
  });

  it('tool call fails on GraphQL errors array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            errors: [{ message: 'Project not found' }],
          }),
        text: () => Promise.resolve(JSON.stringify({ errors: [{ message: 'Project not found' }] })),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'railway-get-project', { projectId: 'nonexistent' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('not found');
  });
});
