/**
 * Tests for the Jira Agent App.
 *
 * Mocks the Jira API so tests run without real credentials.
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
    installationId: 'inst_jira',
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
    context: { userId: 'u_test', installationId: 'inst_jira' },
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
      json: () => Promise.resolve({ displayName: 'Test User' }),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.jira',
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
        secrets: {
          JIRA_URL: 'https://test.atlassian.net',
          JIRA_EMAIL: 'user@example.com',
          JIRA_API_TOKEN: 'fake-token-123',
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

describe('Jira Agent App', () => {
  it('lists all 15 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-comment',
      'assign-issue',
      'create-issue',
      'get-issue',
      'get-myself',
      'get-project',
      'get-sprint',
      'get-transitions',
      'list-boards',
      'list-projects',
      'list-sprints',
      'search-issues',
      'search-users',
      'transition-issue',
      'update-issue',
    ]);
  });

  it('health check reports ready with credentials', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
    expect(health.message).toContain('Test User');
  });

  it('search-issues sends correct JQL query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          issues: [
            { key: 'PROJ-1', fields: { summary: 'First issue' } },
            { key: 'PROJ-2', fields: { summary: 'Second issue' } },
          ],
          total: 2,
          startAt: 0,
          maxResults: 20,
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-issues', { jql: 'project = PROJ' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.total).toBe(2);
    expect(data.issues as Array<Record<string, unknown>>).toHaveLength(2);

    // Verify the GET call included JQL in the query string
    const getCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const url = call[0] as string;
      return url.includes('/rest/api/3/search');
    });
    expect(getCall).toBeDefined();
    const url = getCall![0] as string;
    expect(url).toContain('jql=project');
  });

  it('create-issue sends correct JSON body with ADF description', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: '10001',
          key: 'PROJ-42',
          self: 'https://test.atlassian.net/rest/api/3/issue/10001',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-issue', {
      projectKey: 'PROJ',
      issueType: 'Bug',
      summary: 'Something is broken',
      description: 'It does not work as expected.',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.key).toBe('PROJ-42');

    // Verify the POST call sent JSON with ADF body
    const postCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'POST' && (call[0] as string).includes('/rest/api/3/issue');
    });
    expect(postCall).toBeDefined();
    const [, opts] = postCall as [string, Record<string, unknown>];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body.fields.project.key).toBe('PROJ');
    expect(body.fields.issuetype.name).toBe('Bug');
    expect(body.fields.summary).toBe('Something is broken');
    expect(body.fields.description.type).toBe('doc');
    expect(body.fields.description.content[0].content[0].text).toBe(
      'It does not work as expected.',
    );
  });

  it('get-transitions returns transitions array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            transitions: [
              { id: '11', name: 'To Do' },
              { id: '21', name: 'In Progress' },
              { id: '31', name: 'Done' },
            ],
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-transitions', { issueKey: 'PROJ-1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const transitions = result.result as Array<{ id: string; name: string }>;
    expect(transitions).toHaveLength(3);
    expect(transitions[0].name).toBe('To Do');
    expect(transitions[2].id).toBe('31');
  });

  it('assign-issue sends PUT with accountId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'assign-issue', {
      issueKey: 'PROJ-99',
      accountId: '5b10ac8d82e05b22cc7d4ef5',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    // Verify the PUT call was made to the correct endpoint
    const putCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as Record<string, unknown>;
      return opts.method === 'PUT' && (call[0] as string).includes('/assignee');
    });
    expect(putCall).toBeDefined();
    const [url, opts] = putCall as [string, Record<string, unknown>];
    expect(url).toContain('/rest/api/3/issue/PROJ-99/assignee');
    const body = JSON.parse(opts.body as string);
    expect(body.accountId).toBe('5b10ac8d82e05b22cc7d4ef5');
  });

  it('API error returns failure with Jira error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () =>
          Promise.resolve({
            errorMessages: ['Client must be authenticated to access this resource.'],
            errors: {},
          }),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-myself', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('JIRA_ERROR');
    expect(error.message as string).toContain('401');
  });
});
