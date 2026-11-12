/**
 * Tests for the Salesforce Agent App.
 *
 * Mocks the Salesforce REST API via globalThis.fetch so tests run without
 * real credentials.
 *
 * Covers:
 *  - Tool listing (all 18 tools registered)
 *  - Health check (validates credentials via GET /services/data/v59.0/)
 *  - SOQL query returns data
 *  - get-account returns account record
 *  - create-lead sends correct JSON payload
 *  - describe-object returns object metadata
 *  - API error returns failure
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
    installationId: 'inst_salesforce',
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
    context: { userId: 'u_test', installationId: 'inst_salesforce' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('{}'),
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
  });
  vi.stubGlobal('fetch', fetchMock);

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.salesforce',
    appVersion: '2.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  // Auto-respond to secret requests from the app
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
        secrets: {
          ACCESS_TOKEN: 'test-sf-token',
          REFRESH_TOKEN: 'test-refresh-token',
          INSTANCE_URL: 'https://mycompany.my.salesforce.com',
        },
      } as MessageBase);
    }
    if (type === 'get_system_secrets') {
      host.send({
        ...createEnvelope('system_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: {
          CLIENT_ID: 'test-client-id',
          CLIENT_SECRET: 'test-client-secret',
          REDIRECT_URI: 'https://example.com/callback',
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

// ===========================================================================
// Tests
// ===========================================================================

describe('Salesforce Agent App', () => {
  // -------------------------------------------------------------------------
  // Tool listing
  // -------------------------------------------------------------------------
  it('lists all 18 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools).toHaveLength(18);
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create-account',
      'create-contact',
      'create-lead',
      'create-opportunity',
      'create-task',
      'delete-record',
      'describe-object',
      'get-account',
      'get-contact',
      'get-record-by-external-id',
      'list-accounts',
      'list-cases',
      'list-contacts',
      'list-opportunities',
      'list-tasks',
      'list-users',
      'query',
      'update-record',
    ]);
  });

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------
  it('health check responds ready on valid credentials', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  // -------------------------------------------------------------------------
  // query
  // -------------------------------------------------------------------------
  it('query returns SOQL results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            totalSize: 2,
            done: true,
            records: [
              { Id: '001A', Name: 'Acme', attributes: { type: 'Account' } },
              { Id: '001B', Name: 'Globex', attributes: { type: 'Account' } },
            ],
          }),
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'query', { soql: 'SELECT Id, Name FROM Account LIMIT 2' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.totalSize).toBe(2);
    expect(data.done).toBe(true);
    const records = data.records as Array<Record<string, unknown>>;
    expect(records).toHaveLength(2);
    expect(records[0].Name).toBe('Acme');
  });

  // -------------------------------------------------------------------------
  // get-account
  // -------------------------------------------------------------------------
  it('get-account returns account record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            Id: '001ABCDEF',
            Name: 'Acme Corp',
            Industry: 'Technology',
            Phone: '+1-555-0100',
            Website: 'https://acme.com',
            Type: 'Customer',
            NumberOfEmployees: 500,
            AnnualRevenue: 10000000,
            CreatedDate: '2023-01-01T00:00:00.000+0000',
            LastModifiedDate: '2023-06-15T12:00:00.000+0000',
          }),
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-account', { accountId: '001ABCDEF' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('001ABCDEF');
    expect(data.name).toBe('Acme Corp');
    expect(data.industry).toBe('Technology');
    expect(data.phone).toBe('+1-555-0100');
    expect(data.numberOfEmployees).toBe(500);
  });

  // -------------------------------------------------------------------------
  // create-lead
  // -------------------------------------------------------------------------
  it('create-lead sends correct JSON payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: '00QLEAD001',
          success: true,
          errors: [],
        }),
      headers: new Headers({ 'content-type': 'application/json' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-lead', {
      firstName: 'Jane',
      lastName: 'Smith',
      company: 'Acme Corp',
      email: 'jane@acme.com',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('00QLEAD001');
    expect(data.success).toBe(true);

    // Verify the fetch call to the Salesforce API
    const sfCalls = mockFetch.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('sobjects/Lead'),
    );
    expect(sfCalls.length).toBeGreaterThan(0);

    const lastCall = sfCalls[sfCalls.length - 1];
    expect(lastCall[1].method).toBe('POST');
    const body = JSON.parse(lastCall[1].body);
    expect(body.FirstName).toBe('Jane');
    expect(body.LastName).toBe('Smith');
    expect(body.Company).toBe('Acme Corp');
    expect(body.Email).toBe('jane@acme.com');
  });

  // -------------------------------------------------------------------------
  // describe-object
  // -------------------------------------------------------------------------
  it('describe-object returns object metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            name: 'Account',
            label: 'Account',
            labelPlural: 'Accounts',
            keyPrefix: '001',
            custom: false,
            createable: true,
            updateable: true,
            deletable: true,
            queryable: true,
            fields: [
              {
                name: 'Id',
                label: 'Account ID',
                type: 'id',
                length: 18,
                nillable: false,
                defaultedOnCreate: true,
                createable: false,
                updateable: false,
                externalId: false,
              },
              {
                name: 'Name',
                label: 'Account Name',
                type: 'string',
                length: 255,
                nillable: false,
                defaultedOnCreate: false,
                createable: true,
                updateable: true,
                externalId: false,
              },
            ],
            recordTypeInfos: [
              {
                name: 'Master',
                recordTypeId: '012000000000000AAA',
                active: true,
                defaultRecordTypeMapping: true,
              },
            ],
            childRelationships: [{ childSObject: 'Contact' }, { childSObject: 'Opportunity' }],
          }),
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'describe-object', { objectType: 'Account' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.name).toBe('Account');
    expect(data.label).toBe('Account');
    expect(data.createable).toBe(true);
    expect(data.queryable).toBe(true);

    const fields = data.fields as Array<Record<string, unknown>>;
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('Id');
    expect(fields[1].name).toBe('Name');
    expect(fields[1].required).toBe(true);

    expect(data.childRelationships).toBe(2);
  });

  // -------------------------------------------------------------------------
  // API error
  // -------------------------------------------------------------------------
  it('tool call returns failure on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () =>
          Promise.resolve(
            JSON.stringify([
              { message: 'Session expired or invalid', errorCode: 'INVALID_SESSION_ID' },
            ]),
          ),
        statusText: 'Unauthorized',
        headers: new Headers(),
      }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-accounts', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(typeof error.message).toBe('string');
    expect(error.message as string).toContain('SALESFORCE_ERROR');
  });
});
