/**
 * Tests for the Google Forms Agent App.
 *
 * Mocks the googleapis library so tests run without real credentials.
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
// Mock googleapis before importing the app
// ---------------------------------------------------------------------------

const mockFormsCreate = vi.fn();
const mockFormsGet = vi.fn();
const mockFormsBatchUpdate = vi.fn();
const mockResponsesList = vi.fn();
const mockResponsesGet = vi.fn();
const mockWatchesCreate = vi.fn();
const mockWatchesList = vi.fn();
const mockDriveFilesList = vi.fn();
const mockGetTokenInfo = vi.fn();
const mockSetCredentials = vi.fn();
const mockRefreshAccessToken = vi.fn();

vi.mock('googleapis', () => {
  const OAuth2 = vi.fn().mockImplementation(() => ({
    credentials: { access_token: 'test-access-token', refresh_token: 'test-refresh-token' },
    setCredentials: mockSetCredentials,
    getTokenInfo: mockGetTokenInfo,
    refreshAccessToken: mockRefreshAccessToken,
  }));

  return {
    google: {
      auth: { OAuth2 },
      forms: vi.fn().mockReturnValue({
        forms: {
          create: mockFormsCreate,
          get: mockFormsGet,
          batchUpdate: mockFormsBatchUpdate,
          responses: {
            list: mockResponsesList,
            get: mockResponsesGet,
          },
          watches: {
            create: mockWatchesCreate,
            list: mockWatchesList,
          },
        },
      }),
      drive: vi.fn().mockReturnValue({
        files: {
          list: mockDriveFilesList,
        },
      }),
    },
  };
});

// Import after mock is set up
const { factory } = await import('../src/app.js');

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
    installationId: 'inst_google_forms',
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
    context: { userId: 'u_test', installationId: 'inst_google_forms' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGetTokenInfo.mockResolvedValue({ email: 'test@example.com' });
  mockFormsCreate.mockReset();
  mockFormsGet.mockReset();
  mockFormsBatchUpdate.mockReset();
  mockResponsesList.mockReset();
  mockResponsesGet.mockReset();
  mockWatchesCreate.mockReset();
  mockWatchesList.mockReset();
  mockDriveFilesList.mockReset();
  mockRefreshAccessToken.mockReset();

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.google.forms',
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
        secrets: { ACCESS_TOKEN: 'test-access-token', REFRESH_TOKEN: 'test-refresh-token' },
      } as MessageBase);
    }
    if (type === 'refresh_auth') {
      host.send({
        ...createEnvelope('auth_refreshed', sessionId),
        id: requestId,
        requestId,
        accessToken: 'refreshed-access-token',
        refreshToken: 'test-refresh-token',
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

describe('Google Forms Agent App', () => {
  it('lists all 12 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-question',
      'create-form',
      'create-watch',
      'delete-item',
      'get-form',
      'get-response',
      'list-forms',
      'list-responses',
      'list-watches',
      'update-form',
      'update-form-info',
      'update-item',
    ]);
  });

  it('health check reports ready with valid credentials', async () => {
    mockDriveFilesList.mockResolvedValue({
      data: { files: [{ id: 'form_1' }] },
    });

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('create-form creates a new form and returns id and responder url', async () => {
    mockFormsCreate.mockResolvedValue({
      data: {
        formId: 'form_123',
        info: { title: 'Test Survey', documentTitle: 'Test Survey' },
        responderUri: 'https://docs.google.com/forms/d/form_123/viewform',
        revisionId: 'rev_1',
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'create-form', { title: 'Test Survey' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.formId).toBe('form_123');
    expect(data.title).toBe('Test Survey');
    expect(data.responderUri).toBe('https://docs.google.com/forms/d/form_123/viewform');
  });

  it('get-form returns form structure with items', async () => {
    mockFormsGet.mockResolvedValue({
      data: {
        formId: 'form_456',
        info: { title: 'Feedback Form', documentTitle: 'Feedback', description: 'Please fill out' },
        responderUri: 'https://docs.google.com/forms/d/form_456/viewform',
        items: [
          {
            itemId: 'item_1',
            title: 'What is your name?',
            questionItem: {
              question: {
                questionId: 'q_1',
                required: true,
                textQuestion: {},
              },
            },
          },
        ],
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'get-form', { formId: 'form_456' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.formId).toBe('form_456');
    expect(data.title).toBe('Feedback Form');
    expect(data.items).toBeDefined();
    expect((data.items as unknown[]).length).toBe(1);
  });

  it('list-forms returns forms from Drive', async () => {
    mockDriveFilesList.mockResolvedValue({
      data: {
        files: [
          {
            id: 'form_a',
            name: 'Survey A',
            createdTime: '2024-01-01',
            modifiedTime: '2024-01-02',
            webViewLink: 'https://...',
          },
          {
            id: 'form_b',
            name: 'Survey B',
            createdTime: '2024-01-03',
            modifiedTime: '2024-01-04',
            webViewLink: 'https://...',
          },
        ],
        nextPageToken: null,
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'list-forms', { pageSize: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const forms = data.forms as Array<Record<string, unknown>>;
    expect(forms).toHaveLength(2);
    expect(forms[0].id).toBe('form_a');
    expect(forms[1].name).toBe('Survey B');
  });

  it('list-responses returns form responses', async () => {
    mockResponsesList.mockResolvedValue({
      data: {
        responses: [
          {
            responseId: 'resp_1',
            createTime: '2024-06-01T10:00:00Z',
            lastSubmittedTime: '2024-06-01T10:05:00Z',
            respondentEmail: 'user@example.com',
            answers: {},
          },
        ],
        nextPageToken: undefined,
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'list-responses', { formId: 'form_456' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const responses = data.responses as Array<Record<string, unknown>>;
    expect(responses).toHaveLength(1);
    expect(responses[0].responseId).toBe('resp_1');
    expect(responses[0].respondentEmail).toBe('user@example.com');
  });

  it('update-form fails on API error', async () => {
    mockFormsBatchUpdate.mockRejectedValue(
      Object.assign(new Error('Permission denied'), { code: 403 }),
    );

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'update-form', {
      formId: 'form_xyz',
      requests: [{ updateFormInfo: { info: { title: 'New Title' }, updateMask: 'title' } }],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('Permission denied');
  });

  it('update-form-info updates form title and description', async () => {
    mockFormsBatchUpdate.mockResolvedValue({
      data: {
        revisionId: 'rev_2',
        replies: [{}],
        form: {
          formId: 'form_789',
          info: { title: 'Updated Title', documentTitle: 'Updated Doc', description: 'New desc' },
          responderUri: 'https://docs.google.com/forms/d/form_789/viewform',
        },
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'update-form-info', {
      formId: 'form_789',
      title: 'Updated Title',
      description: 'New desc',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.revisionId).toBe('rev_2');

    const form = data.form as Record<string, unknown>;
    expect(form.title).toBe('Updated Title');
    expect(form.description).toBe('New desc');

    // Verify the correct batchUpdate request was made
    expect(mockFormsBatchUpdate).toHaveBeenCalledWith({
      formId: 'form_789',
      requestBody: {
        requests: [
          {
            updateFormInfo: {
              info: { title: 'Updated Title', description: 'New desc' },
              updateMask: 'title,description',
            },
          },
        ],
        includeFormInResponse: true,
      },
    });
  });

  it('update-form-info fails when no fields are provided', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'update-form-info', { formId: 'form_789' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('At least one of');
  });

  it('add-question adds a text question to a form', async () => {
    mockFormsBatchUpdate.mockResolvedValue({
      data: {
        revisionId: 'rev_3',
        replies: [{ createItem: { itemId: 'item_new', questionId: ['q_new'] } }],
        form: {
          formId: 'form_abc',
          info: { title: 'My Form' },
          items: [
            {
              itemId: 'item_new',
              title: 'What is your email?',
              questionItem: { question: { textQuestion: {} } },
            },
          ],
        },
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'add-question', {
      formId: 'form_abc',
      title: 'What is your email?',
      questionItem: { question: { required: true, textQuestion: {} } },
      index: 0,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.revisionId).toBe('rev_3');

    const createdItem = data.createdItem as Record<string, unknown>;
    expect(createdItem.itemId).toBe('item_new');

    const form = data.form as Record<string, unknown>;
    expect(form.itemCount).toBe(1);

    // Verify batchUpdate was called with createItem request
    expect(mockFormsBatchUpdate).toHaveBeenCalledWith({
      formId: 'form_abc',
      requestBody: {
        requests: [
          {
            createItem: {
              item: {
                title: 'What is your email?',
                questionItem: { question: { required: true, textQuestion: {} } },
              },
              location: { index: 0 },
            },
          },
        ],
        includeFormInResponse: true,
      },
    });
  });

  it('delete-item deletes an item by index', async () => {
    mockFormsBatchUpdate.mockResolvedValue({
      data: {
        revisionId: 'rev_4',
        replies: [{}],
        form: {
          formId: 'form_del',
          info: { title: 'Trimmed Form' },
          items: [],
        },
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'delete-item', { formId: 'form_del', index: 0 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.revisionId).toBe('rev_4');

    const form = data.form as Record<string, unknown>;
    expect(form.itemCount).toBe(0);

    expect(mockFormsBatchUpdate).toHaveBeenCalledWith({
      formId: 'form_del',
      requestBody: {
        requests: [{ deleteItem: { location: { index: 0 } } }],
        includeFormInResponse: true,
      },
    });
  });

  it('update-item updates an existing item', async () => {
    mockFormsBatchUpdate.mockResolvedValue({
      data: {
        revisionId: 'rev_5',
        replies: [{}],
        form: {
          formId: 'form_upd',
          info: { title: 'Updated Form' },
          items: [
            {
              itemId: 'item_1',
              title: 'Updated Question Title',
              questionItem: { question: { textQuestion: {} } },
            },
          ],
        },
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'update-item', {
      formId: 'form_upd',
      item: { itemId: 'item_1', title: 'Updated Question Title' },
      location: { index: 0 },
      updateMask: 'title',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.revisionId).toBe('rev_5');

    const form = data.form as Record<string, unknown>;
    expect(form.itemCount).toBe(1);
    const items = form.items as Array<Record<string, unknown>>;
    expect(items[0].title).toBe('Updated Question Title');

    expect(mockFormsBatchUpdate).toHaveBeenCalledWith({
      formId: 'form_upd',
      requestBody: {
        requests: [
          {
            updateItem: {
              item: { itemId: 'item_1', title: 'Updated Question Title' },
              location: { index: 0 },
              updateMask: 'title',
            },
          },
        ],
        includeFormInResponse: true,
      },
    });
  });

  it('list-watches returns watches on a form', async () => {
    mockWatchesList.mockResolvedValue({
      data: {
        watches: [
          {
            id: 'watch_1',
            eventType: 'RESPONSES',
            target: { topic: { topicName: 'projects/my-proj/topics/my-topic' } },
            state: 'ACTIVE',
            createTime: '2024-06-01T00:00:00Z',
            expireTime: '2024-06-08T00:00:00Z',
          },
        ],
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'list-watches', { formId: 'form_456' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const watches = data.watches as Array<Record<string, unknown>>;
    expect(watches).toHaveLength(1);
    expect(watches[0].id).toBe('watch_1');
    expect(watches[0].eventType).toBe('RESPONSES');
    expect(watches[0].state).toBe('ACTIVE');
  });

  it('create-watch creates a new watch on a form', async () => {
    mockWatchesCreate.mockResolvedValue({
      data: {
        id: 'watch_new',
        eventType: 'SCHEMA',
        target: { topic: { topicName: 'projects/my-proj/topics/form-changes' } },
        state: 'ACTIVE',
        createTime: '2024-07-01T00:00:00Z',
        expireTime: '2024-07-08T00:00:00Z',
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'create-watch', {
      formId: 'form_456',
      eventType: 'SCHEMA',
      topicName: 'projects/my-proj/topics/form-changes',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.id).toBe('watch_new');
    expect(data.eventType).toBe('SCHEMA');
    expect(data.state).toBe('ACTIVE');
    expect(data.expireTime).toBe('2024-07-08T00:00:00Z');

    expect(mockWatchesCreate).toHaveBeenCalledWith({
      formId: 'form_456',
      requestBody: {
        watch: {
          eventType: 'SCHEMA',
          target: { topic: { topicName: 'projects/my-proj/topics/form-changes' } },
        },
        watchId: undefined,
      },
    });
  });

  it('get-response returns a specific form response', async () => {
    mockResponsesGet.mockResolvedValue({
      data: {
        responseId: 'resp_42',
        createTime: '2024-06-15T12:00:00Z',
        lastSubmittedTime: '2024-06-15T12:05:00Z',
        respondentEmail: 'responder@example.com',
        answers: {
          q_1: {
            textAnswers: { answers: [{ value: 'John Doe' }] },
          },
        },
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'get-response', { formId: 'form_456', responseId: 'resp_42' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.responseId).toBe('resp_42');
    expect(data.respondentEmail).toBe('responder@example.com');
    const answers = data.answers as Record<string, Record<string, unknown>>;
    expect(answers.q_1.type).toBe('text');
    expect(answers.q_1.values).toEqual(['John Doe']);
  });
});
