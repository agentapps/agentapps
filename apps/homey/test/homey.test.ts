/**
 * Tests for the Homey Agent App.
 *
 * Mocks the Homey/Athom Cloud API so tests run without real credentials.
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
// Mock the homey-api module before anything imports it
// ---------------------------------------------------------------------------

const mockGetDevices = vi.fn();
const mockGetDevice = vi.fn();
const mockSetCapabilityValue = vi.fn();
const mockGetFlows = vi.fn();
const mockTriggerFlow = vi.fn();
const mockGetZones = vi.fn();
const mockGetUsers = vi.fn();
const mockGetApps = vi.fn();
const mockGetNotifications = vi.fn();

const mockHomeyApi = {
  devices: {
    getDevices: mockGetDevices,
    getDevice: mockGetDevice,
  },
  flow: { getFlows: mockGetFlows, triggerFlow: mockTriggerFlow },
  zones: { getZones: mockGetZones },
  users: { getUsers: mockGetUsers },
  apps: { getApps: mockGetApps },
  notifications: { getNotifications: mockGetNotifications },
};

vi.mock('homey-api/lib/AthomCloudAPI.js', () => {
  class MockToken {
    constructor(public data: Record<string, unknown>) {}
  }

  class MockAthomCloudAPI {
    static Token = MockToken;
    __token: unknown;
    async getAuthenticatedUser() {
      return {
        async getFirstHomey() {
          return {
            async authenticate() {
              return mockHomeyApi;
            },
          };
        },
      };
    }
  }

  return { default: MockAthomCloudAPI };
});

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
    installationId: 'inst_homey',
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
    context: { userId: 'u_test', installationId: 'inst_homey' },
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
      text: () => Promise.resolve(''),
    }),
  );

  // Reset mocks
  mockGetDevices.mockReset().mockResolvedValue({});
  mockGetDevice.mockReset().mockResolvedValue({
    id: 'dev1',
    name: 'Test Device',
    zone: 'z1',
    setCapabilityValue: mockSetCapabilityValue,
  });
  mockSetCapabilityValue.mockReset().mockResolvedValue(undefined);
  mockGetFlows.mockReset().mockResolvedValue({});
  mockTriggerFlow.mockReset().mockResolvedValue(undefined);
  mockGetZones.mockReset().mockResolvedValue({ z1: { name: 'Living Room' } });
  mockGetUsers
    .mockReset()
    .mockResolvedValue({ u1: { name: 'Test User', email: 'test@example.com' } });
  mockGetApps.mockReset().mockResolvedValue({});
  mockGetNotifications.mockReset().mockResolvedValue({});

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.homey',
    appVersion: '2.0.2',
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
        secrets: { CLIENT_ID: 'test-client-id', CLIENT_SECRET: 'test-client-secret' },
      } as MessageBase);
    }
    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: {
          ACCESS_TOKEN: 'test-access-token',
          REFRESH_TOKEN: 'test-refresh-token',
          TOKEN_TYPE: 'bearer',
          EXPIRES_IN: '3600',
        },
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

describe('Homey Agent App', () => {
  it('lists all 13 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'homey-get-device',
      'homey-get-energy',
      'homey-get-system-info',
      'homey-get-user',
      'homey-get-variables',
      'homey-list-apps',
      'homey-list-devices',
      'homey-list-flows',
      'homey-list-notifications',
      'homey-list-zones',
      'homey-set-capability',
      'homey-set-variable',
      'homey-trigger-flow',
    ]);
  });

  it('health check completes with valid OAuth secrets', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The Homey health handler returns { status: 'ready' } when OAuth secrets
    // are present and valid. The SDK correctly reports 'ready'.
    expect(health.status).toBe('ready');
    expect(health.version).toBe('2.0.2');
  });

  it('list-devices returns device list with zone names', async () => {
    mockGetDevices.mockResolvedValue({
      dev1: {
        id: 'dev1',
        name: 'Living Room Light',
        zone: 'z1',
        class: 'light',
        capabilities: ['onoff', 'dim'],
        capabilitiesObj: {},
        available: true,
        ready: true,
      },
      dev2: {
        id: 'dev2',
        name: 'Thermostat',
        zone: 'z1',
        class: 'thermostat',
        capabilities: ['target_temperature'],
        capabilitiesObj: {},
        available: true,
        ready: true,
      },
    });

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'homey-list-devices', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('Living Room Light');
    expect(data[0].zoneName).toBe('Living Room');
    expect(data[1].name).toBe('Thermostat');
  });

  it('set-capability sets a device value and returns success', async () => {
    const mockDevice = {
      id: 'dev1',
      name: 'Living Room Light',
      zone: 'z1',
      setCapabilityValue: mockSetCapabilityValue,
    };
    mockGetDevice.mockResolvedValue(mockDevice);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'homey-set-capability', {
      device_id: 'dev1',
      capability: 'onoff',
      value: true,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.device_id).toBe('dev1');
    expect(data.capability).toBe('onoff');
    expect(data.value).toBe(true);
    expect(mockSetCapabilityValue).toHaveBeenCalledWith({
      capabilityId: 'onoff',
      value: true,
    });
  });

  it('get-user returns user information', async () => {
    mockGetUsers.mockResolvedValue({
      u1: { name: 'John Doe', email: 'john@example.com', role: 'owner' },
    });

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'homey-get-user', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data).toBeDefined();
  });

  it('health check reports ready even when CLIENT_ID is missing', async () => {
    // Override system secrets to return empty. The health handler still returns
    // { status: 'ready' } because credential validation is deferred to tool calls.
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
          secrets: {},
        } as MessageBase);
      }
      if (type === 'get_installation_secrets') {
        host.send({
          ...createEnvelope('installation_secrets', sessionId),
          id: requestId,
          requestId,
          secrets: {},
        } as MessageBase);
      }
    });

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });
});
