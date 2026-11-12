/**
 * Tests for the PostHog Agent App.
 *
 * Mocks the PostHog API so tests run without real credentials.
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
    installationId: 'inst_posthog',
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
    context: { userId: 'u_test', installationId: 'inst_posthog' },
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
      json: () => Promise.resolve({}),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.posthog',
    appVersion: '2.1.0',
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
        secrets: { API_KEY: 'phx_fake_api_key_123', PROJECT_ID: '12345' },
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

describe('PostHog Agent App', () => {
  it('lists all 18 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_action',
      'create_annotation',
      'create_feature_flag',
      'get_dashboard',
      'get_event',
      'get_experiment',
      'get_feature_flag',
      'get_person',
      'list_actions',
      'list_cohorts',
      'list_dashboards',
      'list_events',
      'list_experiments',
      'list_feature_flags',
      'list_insights',
      'list_persons',
      'list_session_recordings',
      'update_feature_flag',
    ]);
  });

  it('health check reports ready with API credentials', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('list_events returns event data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { id: 'evt_1', event: '$pageview', timestamp: '2024-07-25T10:00:00Z' },
              { id: 'evt_2', event: 'sign_up', timestamp: '2024-07-25T10:05:00Z' },
            ],
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list_events', { limit: 5 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0].event).toBe('$pageview');
    expect(results[1].event).toBe('sign_up');
  });

  it('list_feature_flags returns flag list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { id: 1, key: 'beta-feature', active: true, rollout_percentage: 50 },
              { id: 2, key: 'new-onboarding', active: false, rollout_percentage: 0 },
            ],
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list_feature_flags', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0].key).toBe('beta-feature');
    expect(results[1].active).toBe(false);
  });

  it('create_annotation sends POST with correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 42,
          content: 'v2.3.0 deployed',
          date_marker: '2024-07-25T14:30:00Z',
          scope: 'organization',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create_annotation', {
      content: 'v2.3.0 deployed',
      date_marker: '2024-07-25T14:30:00Z',
      scope: 'organization',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.content).toBe('v2.3.0 deployed');
    expect(data.id).toBe(42);

    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toContain('/annotations');
    expect(fetchCall[1].method).toBe('POST');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.content).toBe('v2.3.0 deployed');
    expect(body.date_marker).toBe('2024-07-25T14:30:00Z');
    expect(body.scope).toBe('organization');
  });

  it('create_feature_flag sends POST with correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 99,
          key: 'new-checkout',
          name: 'New Checkout Flow',
          active: true,
          filters: { groups: [{ rollout_percentage: 25 }] },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create_feature_flag', {
      key: 'new-checkout',
      name: 'New Checkout Flow',
      filters: { groups: [{ rollout_percentage: 25 }] },
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.key).toBe('new-checkout');
    expect(data.id).toBe(99);

    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toContain('/feature_flags');
    expect(fetchCall[1].method).toBe('POST');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.key).toBe('new-checkout');
    expect(body.name).toBe('New Checkout Flow');
    expect(body.filters.groups[0].rollout_percentage).toBe(25);
  });

  it('API error returns failure with PostHog error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () =>
          Promise.resolve({
            detail: 'Authentication credentials were not provided.',
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list_events', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('POSTHOG_ERROR');
    expect(error.message as string).toContain('401');
  });
});
