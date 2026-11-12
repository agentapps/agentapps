/**
 * Integration tests for the Google Analytics Agent App.
 *
 * Uses the InProcessRuntime harness (same pattern as the ElevenLabs test).
 * Mocks the googleapis client library so tests run without real credentials.
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

// ---------------------------------------------------------------------------
// Mock googleapis -- must be set up BEFORE importing the app factory
// ---------------------------------------------------------------------------

const mockAccountsList = vi.fn().mockResolvedValue({
  data: {
    accounts: [{ name: 'accounts/111', displayName: 'Test Account', regionCode: 'US' }],
  },
});
const mockPropertiesList = vi.fn().mockResolvedValue({
  data: {
    properties: [
      {
        name: 'properties/222',
        displayName: 'Test Property',
        propertyType: 'PROPERTY_TYPE_ORDINARY',
        parent: 'accounts/111',
        timeZone: 'America/New_York',
        currencyCode: 'USD',
      },
    ],
  },
});
const mockPropertiesGet = vi.fn().mockResolvedValue({
  data: {
    name: 'properties/222',
    displayName: 'Test Property',
    propertyType: 'PROPERTY_TYPE_ORDINARY',
    parent: 'accounts/111',
    timeZone: 'America/New_York',
    currencyCode: 'USD',
  },
});
const mockRunReport = vi.fn().mockResolvedValue({
  data: {
    dimensionHeaders: [{ name: 'country' }],
    metricHeaders: [{ name: 'activeUsers', type: 'TYPE_INTEGER' }],
    rows: [
      {
        dimensionValues: [{ value: 'US' }],
        metricValues: [{ value: '1234' }],
      },
    ],
    rowCount: 1,
  },
});
const mockRunRealtimeReport = vi.fn().mockResolvedValue({
  data: {
    dimensionHeaders: [{ name: 'country' }],
    metricHeaders: [{ name: 'activeUsers', type: 'TYPE_INTEGER' }],
    rows: [
      {
        dimensionValues: [{ value: 'US' }],
        metricValues: [{ value: '42' }],
      },
    ],
    rowCount: 1,
  },
});
const mockBatchRunReports = vi.fn().mockResolvedValue({
  data: {
    reports: [
      {
        dimensionHeaders: [{ name: 'country' }],
        metricHeaders: [{ name: 'sessions', type: 'TYPE_INTEGER' }],
        rows: [{ dimensionValues: [{ value: 'US' }], metricValues: [{ value: '100' }] }],
        rowCount: 1,
      },
    ],
  },
});
const mockGetMetadata = vi.fn().mockResolvedValue({
  data: {
    dimensions: [{ apiName: 'country', uiName: 'Country', description: 'User country' }],
    metrics: [
      {
        apiName: 'activeUsers',
        uiName: 'Active users',
        description: 'Count',
        type: 'TYPE_INTEGER',
      },
    ],
  },
});

vi.mock('googleapis', () => {
  const mockOAuth2 = vi.fn().mockImplementation(() => ({
    setCredentials: vi.fn(),
    refreshAccessToken: vi.fn().mockResolvedValue({ credentials: {} }),
  }));

  return {
    google: {
      auth: { OAuth2: mockOAuth2 },
      analyticsdata: vi.fn().mockReturnValue({
        properties: {
          runReport: mockRunReport,
          runRealtimeReport: mockRunRealtimeReport,
          batchRunReports: mockBatchRunReports,
          getMetadata: mockGetMetadata,
        },
      }),
      analyticsadmin: vi.fn().mockReturnValue({
        accounts: { list: mockAccountsList },
        properties: {
          list: mockPropertiesList,
          get: mockPropertiesGet,
          create: vi.fn().mockResolvedValue({
            data: { name: 'properties/333', displayName: 'New Property' },
          }),
          patch: vi.fn().mockResolvedValue({
            data: { name: 'properties/222', displayName: 'Updated Property' },
          }),
          delete: vi.fn().mockResolvedValue({ data: {} }),
          dataStreams: {
            list: vi.fn().mockResolvedValue({
              data: {
                dataStreams: [
                  {
                    name: 'properties/222/dataStreams/444',
                    type: 'WEB_DATA_STREAM',
                    displayName: 'My Web Stream',
                  },
                ],
              },
            }),
            get: vi.fn().mockResolvedValue({
              data: {
                name: 'properties/222/dataStreams/444',
                type: 'WEB_DATA_STREAM',
                displayName: 'My Web Stream',
              },
            }),
            create: vi.fn().mockResolvedValue({
              data: {
                name: 'properties/222/dataStreams/555',
                type: 'WEB_DATA_STREAM',
                displayName: 'New Stream',
              },
            }),
          },
        },
      }),
    },
  };
});

// Import after the mock is set up
const { factory } = await import('../src/app.js');

// ---------------------------------------------------------------------------
// Test harness (mirrors elevenlabs test pattern)
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
  timeoutMs = 5000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = received.find((m) => predicate(m as Record<string, unknown>));
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Timeout waiting for message');
}

async function waitForType(type: string, timeoutMs = 5000): Promise<Record<string, unknown>> {
  return waitFor((m) => m.type === type, timeoutMs);
}

const SYSTEM_SECRETS = {
  CLIENT_ID: 'test-client-id',
  CLIENT_SECRET: 'test-client-secret',
  REDIRECT_URI: '["https://localhost/callback"]',
};

const USER_SECRETS = {
  ACCESS_TOKEN: 'test-access-token',
  REFRESH_TOKEN: 'test-refresh-token',
  EMAIL: 'test@example.com',
  EXPIRY_DATE: String(Date.now() + 3600_000), // 1 hour from now
};

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
    installationId: 'inst_ga',
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
    context: { userId: 'u_test', installationId: 'inst_ga' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.google.analytics',
    appVersion: '2.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  // Auto-respond to secret requests
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
        secrets: SYSTEM_SECRETS,
      } as MessageBase);
    }

    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: USER_SECRETS,
      } as MessageBase);
    }
  });

  appStation.accept(ctrlSide);
});

afterEach(async () => {
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Google Analytics Agent App', () => {
  it('lists all 13 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'analytics-batch-run-reports',
      'analytics-create-data-stream',
      'analytics-create-property',
      'analytics-delete-property',
      'analytics-get-data-stream',
      'analytics-get-metadata',
      'analytics-get-property',
      'analytics-list-accounts',
      'analytics-list-data-streams',
      'analytics-list-properties',
      'analytics-run-realtime-report',
      'analytics-run-report',
      'analytics-update-property',
    ]);
  });

  it('health check completes without auth errors when credentials are valid', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The health handler returns { status: 'ready' } after successfully probing
    // the accounts endpoint, and the SDK correctly reports 'ready'.
    expect(health.status).toBe('ready');
    expect(mockAccountsList).toHaveBeenCalled();
  });

  it('analytics-list-accounts returns accounts', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'analytics-list-accounts', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.account).toBe('test@example.com');
    expect(data.count).toBe(1);
    const accounts = data.accounts as Array<Record<string, unknown>>;
    expect(accounts[0].accountId).toBe('111');
    expect(accounts[0].displayName).toBe('Test Account');
  });

  it('analytics-list-properties returns properties for an account', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'analytics-list-properties', { accountId: '111' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.count).toBe(1);
    const props = data.properties as Array<Record<string, unknown>>;
    expect(props[0].propertyId).toBe('222');
    expect(props[0].displayName).toBe('Test Property');
  });

  it('analytics-get-property returns property details', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'analytics-get-property', { propertyId: '222' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const prop = data.property as Record<string, unknown>;
    expect(prop.propertyId).toBe('222');
    expect(prop.displayName).toBe('Test Property');
    expect(prop.currencyCode).toBe('USD');
  });

  it('analytics-run-report returns curated report data', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'analytics-run-report', {
      propertyId: '222',
      metrics: ['activeUsers'],
      dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
      dimensions: ['country'],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.account).toBe('test@example.com');
    expect(data.propertyId).toBe('222');
    expect(data.rowCount).toBe(1);
    const rows = data.rows as Array<Record<string, unknown>>;
    expect(rows[0].dimensionValues).toEqual(['US']);
    expect(rows[0].metricValues).toEqual(['1234']);
  });

  it('analytics-run-report normalizes property id and metrics', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'analytics-run-report', {
      propertyId: 'properties/222',
      metrics: ['sessions'],
      dateRanges: [{ startDate: '2024-01-01', endDate: '2024-01-31' }],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    // Verify the mock was called with the normalized property name
    expect(mockRunReport).toHaveBeenCalledWith(
      expect.objectContaining({
        property: 'properties/222',
        requestBody: expect.objectContaining({
          metrics: [{ name: 'sessions' }],
        }),
      }),
    );
  });

  it('analytics-run-realtime-report returns realtime data', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'analytics-run-realtime-report', {
      propertyId: '222',
      metrics: ['activeUsers'],
      dimensions: ['country'],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.propertyId).toBe('222');
    const rows = data.rows as Array<Record<string, unknown>>;
    expect(rows[0].metricValues).toEqual(['42']);
  });

  it('analytics-batch-run-reports returns multiple reports', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'analytics-batch-run-reports', {
      propertyId: '222',
      requests: [
        {
          metrics: ['sessions'],
          dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
        },
      ],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.count).toBe(1);
    const reports = data.reports as Array<Record<string, unknown>>;
    expect(reports).toHaveLength(1);
    expect(reports[0].rowCount).toBe(1);
  });

  it('analytics-get-metadata returns dimensions and metrics', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'analytics-get-metadata', { propertyId: '222' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.dimensionsCount).toBe(1);
    expect(data.metricsCount).toBe(1);
    const dims = data.dimensions as Array<Record<string, unknown>>;
    expect(dims[0].apiName).toBe('country');
  });

  it('tool call fails on API error with mapped error code', async () => {
    mockRunReport.mockRejectedValueOnce({ status: 401, message: 'Invalid Credentials' });

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'analytics-run-report', {
      propertyId: '222',
      metrics: ['activeUsers'],
      dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('AUTH_EXPIRED');
  });

  it('tool call fails on 403 quota error with RATE_LIMITED code', async () => {
    mockAccountsList.mockRejectedValueOnce({
      status: 403,
      message: 'Quota exceeded for quota metric',
    });

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'analytics-list-accounts', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('RATE_LIMITED');
  });

  it('run-report rejects invalid propertyId at the boundary', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'analytics-run-report', {
      propertyId: 'properties/abc',
      metrics: ['activeUsers'],
      dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('INVALID_ARGUMENT');
  });
});
