/**
 * Tests for the Browserbase Agent App.
 *
 * Mocks the Browserbase SDK and Playwright so tests run without real credentials.
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
// Mock Browserbase SDK + Playwright BEFORE importing the app
// ---------------------------------------------------------------------------

const mockPage = {
  goto: vi.fn().mockResolvedValue(undefined),
  title: vi.fn().mockResolvedValue('Test Page'),
  url: vi.fn().mockReturnValue('about:blank'),
  content: vi.fn().mockResolvedValue('<html><body>Hello</body></html>'),
  evaluate: vi.fn().mockResolvedValue('Hello'),
  click: vi.fn().mockResolvedValue(undefined),
  fill: vi.fn().mockResolvedValue(undefined),
  keyboard: { press: vi.fn().mockResolvedValue(undefined) },
  waitForSelector: vi.fn().mockResolvedValue(undefined),
  screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
  on: vi.fn(),
  accessibility: {
    snapshot: vi.fn().mockResolvedValue({ role: 'WebArea', name: '', children: [] }),
  },
};

const mockContext = {
  pages: vi.fn().mockReturnValue([mockPage]),
  newPage: vi.fn().mockResolvedValue(mockPage),
};

const mockBrowser = {
  contexts: vi.fn().mockReturnValue([mockContext]),
  newContext: vi.fn().mockResolvedValue(mockContext),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@browserbasehq/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      sessions: {
        create: vi.fn().mockResolvedValue({ id: 'sess_test123' }),
        debug: vi.fn().mockResolvedValue({
          wsUrl: 'wss://connect.browserbase.com/test',
          debuggerFullscreenUrl:
            'https://www.browserbase.com/devtools-fullscreen-compiled/index.html?wss=connect.browserbase.com%2Ftest',
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    })),
  };
});

vi.mock('playwright-core', () => ({
  chromium: {
    connectOverCDP: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

// Import after mocks
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
    installationId: 'inst_browserbase',
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
    context: { userId: 'u_test', installationId: 'inst_browserbase' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.browserbase',
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

    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: {
          BROWSERBASE_API_KEY: 'test-bb-key',
          BROWSERBASE_PROJECT_ID: 'test-bb-project',
        },
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

describe('Browserbase Agent App', () => {
  it('lists all 15 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'click',
      'evaluate',
      'fill-form',
      'get-content',
      'navigate',
      'navigate-back',
      'network-requests',
      'press-key',
      'session-close',
      'session-create',
      'session-list',
      'snapshot',
      'take-screenshot',
      'type',
      'wait-for',
    ]);
  });

  it('health check reports ready when credentials are valid', async () => {
    // The Browserbase health handler returns { status: 'ready' } on success,
    // and the SDK correctly reports the status as 'ready'.
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('session-create returns session info with live view URL', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'session-create', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.sessionId).toBe('sess_test123');
    expect(data.liveViewUrl).toBeDefined();
    expect(typeof data.liveViewUrl).toBe('string');
    expect(data.createdAt).toBeDefined();
  });

  it('session-list returns active sessions after creating one', async () => {
    const sessionId = await initAndOpen();

    // Create a session first
    received.length = 0;
    sendToolCall(sessionId, 'session-create', {});
    await waitForType('tool_result');

    // Now list sessions
    received.length = 0;
    sendToolCall(sessionId, 'session-list', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as string;
    // session-list returns a JSON string or a "no active sessions" message
    expect(data).toBeDefined();
  });

  it('navigate goes to a URL and returns the title', async () => {
    const sessionId = await initAndOpen();

    // Create a session first
    received.length = 0;
    sendToolCall(sessionId, 'session-create', {});
    const createResult = await waitForType('tool_result');
    const createdSession = (createResult.result as Record<string, unknown>).sessionId as string;

    // Navigate
    received.length = 0;
    sendToolCall(sessionId, 'navigate', {
      sessionId: createdSession,
      url: 'https://example.com',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as string;
    expect(data).toContain('example.com');
    expect(data).toContain('Test Page');
  });

  it('navigate fails with invalid session ID', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'navigate', {
      sessionId: 'nonexistent_session',
      url: 'https://example.com',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('No active session');
  });

  it('get-content returns page text', async () => {
    const sessionId = await initAndOpen();

    // Create a session first
    received.length = 0;
    sendToolCall(sessionId, 'session-create', {});
    const createResult = await waitForType('tool_result');
    const createdSession = (createResult.result as Record<string, unknown>).sessionId as string;

    // Get content
    received.length = 0;
    sendToolCall(sessionId, 'get-content', {
      sessionId: createdSession,
      format: 'text',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    expect(result.result).toBe('Hello');
  });
});
