/**
 * Tests for the Factorial Agent App.
 *
 * Mocks the Factorial HR API so tests run without real credentials.
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
    installationId: 'inst_factorial',
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
    context: { userId: 'u_test', installationId: 'inst_factorial' },
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
      status: 200,
      json: () => Promise.resolve([]),
      text: () => Promise.resolve('[]'),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.factorial',
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
          ACCESS_TOKEN: 'test-factorial-token',
          REFRESH_TOKEN: 'test-refresh',
          TOKEN_TYPE: 'Bearer',
          USER_ID: 'u_456',
          USER_EMAIL: 'hr@example.com',
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

describe('Factorial Agent App', () => {
  it('lists all 19 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'approve-overtime',
      'create-leave',
      'get-document',
      'get-employee',
      'get-leave',
      'list-compensations',
      'list-contract-versions',
      'list-documents',
      'list-employees',
      'list-leave-types',
      'list-leaves',
      'list-legal-entities',
      'list-locations',
      'list-overtime-requests',
      'list-shifts',
      'list-team-memberships',
      'list-teams',
      'list-worked-times',
      'reject-overtime',
    ]);
  });

  it('health check reports ready with valid token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ id: 1, first_name: 'Test' }]),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('list-employees returns employee data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            {
              id: 1,
              first_name: 'Alice',
              last_name: 'Smith',
              email: 'alice@example.com',
              active: true,
            },
            {
              id: 2,
              first_name: 'Bob',
              last_name: 'Jones',
              email: 'bob@example.com',
              active: true,
            },
            {
              id: 3,
              first_name: 'Carol',
              last_name: 'White',
              email: 'carol@example.com',
              active: false,
            },
          ]),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-employees', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Array<Record<string, unknown>>;
    expect(data).toHaveLength(3);
    expect(data[0].first_name).toBe('Alice');
    expect(data[1].first_name).toBe('Bob');
    expect(data[2].active).toBe(false);
  });

  it('list-employees calls correct API endpoint with filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-employees', { active: true, limit: 10 });

    await waitForType('tool_result');

    // Verify fetch was called with the correct URL
    const calls = fetchMock.mock.calls;
    const employeeCall = calls.find((c: [string, RequestInit]) =>
      (c[0] as string).includes('/employees/employees'),
    );
    expect(employeeCall).toBeDefined();
    expect(employeeCall![0]).toContain('api.factorialhr.com');
    expect(employeeCall![0]).toContain('employees');
  });

  it('create-leave creates a time-off request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 42,
            employee_id: 1,
            leave_type_id: 5,
            start_on: '2024-08-01',
            finish_on: '2024-08-05',
            status: 'pending',
            half_day_start: false,
            half_day_finish: false,
            comment: 'Summer vacation',
          }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-leave', {
      employeeId: 1,
      leaveTypeId: 5,
      startOn: '2024-08-01',
      finishOn: '2024-08-05',
      comment: 'Summer vacation',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe(42);
    expect(data.employee_id).toBe(1);
    expect(data.status).toBe('pending');
    expect(data.start_on).toBe('2024-08-01');
    expect(data.finish_on).toBe('2024-08-05');
  });

  it('create-leave sends correct request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 99 }),
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-leave', {
      employeeId: 7,
      leaveTypeId: 3,
      startOn: '2024-12-24',
      finishOn: '2024-12-31',
      halfDayStart: true,
      halfDayFinish: false,
      comment: 'Holiday break',
    });

    await waitForType('tool_result');

    const calls = fetchMock.mock.calls;
    const leaveCall = calls.find(
      (c: [string, RequestInit]) =>
        (c[0] as string).includes('/timeoff/leaves') && c[1]?.method === 'POST',
    );
    expect(leaveCall).toBeDefined();

    const body = JSON.parse(leaveCall![1].body as string);
    expect(body.employee_id).toBe(7);
    expect(body.leave_type_id).toBe(3);
    expect(body.start_on).toBe('2024-12-24');
    expect(body.finish_on).toBe('2024-12-31');
    expect(body.half_day_start).toBe(true);
    expect(body.half_day_finish).toBe(false);
    expect(body.comment).toBe('Holiday break');
  });

  it('get-employee returns employee details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 1,
            first_name: 'Alice',
            last_name: 'Smith',
            email: 'alice@example.com',
            role: 'admin',
            active: true,
            hire_date: '2020-03-15',
          }),
        text: () => Promise.resolve(''),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-employee', { employeeId: 1 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe(1);
    expect(data.first_name).toBe('Alice');
    expect(data.last_name).toBe('Smith');
    expect(data.email).toBe('alice@example.com');
  });

  it('tool call fails on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Insufficient permissions'),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-employees', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('403');
  });
});
