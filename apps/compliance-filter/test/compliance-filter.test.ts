/**
 * Tests for the Compliance Filter hook app.
 *
 * Exercises the app through the full app station lifecycle to verify:
 * - pre-turn lets clean messages through and vetoes messages with PII
 * - post-turn audits each completed turn and acknowledges the notification
 * - check-text tool scans for PII manually
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectPii, factory } from '../src/app.js';

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

async function waitFor(type: string, timeoutMs = 2000): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = received.find((m) => m.type === type);
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`Timeout waiting for '${type}'`);
}

async function initAndOpen(): Promise<string> {
  host.send({
    ...createEnvelope('initialize'),
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'test', version: '1.0.0' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitFor('initialized');

  received.length = 0;
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'inst_compliance',
    tenant: { userId: 'u_test' },
  } as MessageBase);
  const opened = await waitFor('session_opened');
  received.length = 0;
  return opened.sessionId as string;
}

beforeEach(() => {
  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.compliance-filter',
    appVersion: '1.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);
  appStation.accept(ctrlSide);
});

afterEach(async () => {
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Unit tests: PII detection
// ---------------------------------------------------------------------------

describe('detectPii', () => {
  it('detects SSN patterns', () => {
    const matches = detectPii('My SSN is 123-45-6789');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('SSN');
  });

  it('detects credit card patterns', () => {
    const matches = detectPii('Card: 4111-1111-1111-1111');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('CREDIT_CARD');
  });

  it('detects email addresses', () => {
    const matches = detectPii('Contact me at alice@example.com');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('EMAIL');
  });

  it('detects multiple PII types', () => {
    const matches = detectPii('SSN: 123-45-6789, email: bob@test.com');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array for clean text', () => {
    const matches = detectPii('Hello, how are you today?');
    expect(matches).toHaveLength(0);
  });

  it('handles non-string input', () => {
    expect(detectPii(null as unknown as string)).toHaveLength(0);
    expect(detectPii(undefined as unknown as string)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Hook tests: pre-turn and post-turn
// ---------------------------------------------------------------------------

const HOOK_HOST = {
  name: 'test',
  supports: {
    transform: true,
    transformAttachments: true,
    history: true,
    preservedContext: true,
    onDream: true,
    conversationRead: true,
  },
};
const CONTEXT = { userId: 'u_test', installationId: 'inst_compliance' };

function preTurn(sessionId: string, requestId: string, text: string): void {
  host.send({
    ...createEnvelope('hook_request'),
    sessionId,
    requestId,
    hookPoint: 'pre-turn',
    context: CONTEXT,
    host: HOOK_HOST,
    input: {
      conversationId: 'c1',
      turnId: 't1',
      message: { text, attachments: [] },
      now: new Date().toISOString(),
      history: [],
    },
  } as MessageBase);
}

describe('pre-turn hook', () => {
  it('lets clean messages through with an empty answer', async () => {
    const sessionId = await initAndOpen();
    preTurn(sessionId, 'hk_clean_1', 'Hello, I need help with my project');
    const resp = await waitFor('hook_response');
    expect(resp.requestId).toBe('hk_clean_1');
    expect(resp.veto).toBeUndefined();
    expect(resp.context).toBeUndefined();
  });

  it('vetoes messages containing an SSN', async () => {
    const sessionId = await initAndOpen();
    preTurn(sessionId, 'hk_ssn_1', 'My social security number is 123-45-6789');
    const resp = await waitFor('hook_response');
    const veto = resp.veto as { reason: string; code: string };
    expect(veto.code).toBe('PII_DETECTED');
    expect(veto.reason).toContain('SSN');
  });

  it('vetoes messages containing email addresses', async () => {
    const sessionId = await initAndOpen();
    preTurn(sessionId, 'hk_email_1', 'Send this to alice@company.com please');
    const resp = await waitFor('hook_response');
    const veto = resp.veto as { reason: string; code: string };
    expect(veto.code).toBe('PII_DETECTED');
    expect(veto.reason).toContain('EMAIL');
  });
});

describe('post-turn hook', () => {
  it('acknowledges the notification and audits the response', async () => {
    const sessionId = await initAndOpen();
    const notify = createEnvelope('hook_notify');
    host.send({
      ...notify,
      sessionId,
      notifyId: notify.id,
      hookPoint: 'post-turn',
      key: 'c1:t1',
      context: CONTEXT,
      host: HOOK_HOST,
      input: {
        conversationId: 'c1',
        turnId: 't1',
        message: { text: 'Summarize the project', attachments: [] },
        response: 'Here is the project summary you requested.',
        toolCalls: [],
      },
    } as MessageBase);
    const ack = await waitFor('hook_ack');
    expect(ack.notifyId).toBe(notify.id);
    const log = await waitFor('log');
    expect(log.message).toBe('Response audited');
  });
});

// ---------------------------------------------------------------------------
// Tool tests: check-text
// ---------------------------------------------------------------------------

describe('check-text tool', () => {
  it('reports clean text', async () => {
    const sessionId = await initAndOpen();

    host.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'check-text',
      arguments: { text: 'This is a clean message' },
      context: { userId: 'u_test', installationId: 'inst_compliance' },
    } as MessageBase);

    const result = await waitFor('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as { clean: boolean; matchCount: number };
    expect(data.clean).toBe(true);
    expect(data.matchCount).toBe(0);
  });

  it('detects PII and redacts values', async () => {
    const sessionId = await initAndOpen();

    host.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'check-text',
      arguments: { text: 'SSN: 123-45-6789' },
      context: { userId: 'u_test', installationId: 'inst_compliance' },
    } as MessageBase);

    const result = await waitFor('tool_result');
    expect(result.success).toBe(true);
    const data = result.result as {
      clean: boolean;
      matchCount: number;
      matches: Array<{ type: string; value: string }>;
    };
    expect(data.clean).toBe(false);
    expect(data.matchCount).toBe(1);
    expect(data.matches[0].type).toBe('SSN');
    // Value should be redacted
    expect(data.matches[0].value).toBe('[REDACTED]');
  });
});
