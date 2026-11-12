/**
 * Tests for the PLAUD Agent App.
 *
 * Migrated from mca.plaud/tests/ (3 files).
 *
 * STRUCTURE:
 * - Integration tests via InProcessRuntime (tool listing, health check
 *   through the protocol).
 * - Direct unit tests for pure exported helpers:
 *   getPlaudSecrets, mapRecording, mapSegments, mapNoteDetail, mapTag, mapUser
 *   (plaud-client.ts), and PlaudClient construction (plaud-client.ts).
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
import { factory } from '../src/app.js';
import {
  getPlaudClient,
  getPlaudSecrets,
  mapNoteDetail,
  mapRecording,
  mapSegments,
  mapTag,
  mapUser,
  PlaudClient,
  type SecretsContext,
} from '../src/lib/index.js';

// ---------------------------------------------------------------------------
// Integration test harness (InProcessRuntime)
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
    installationId: 'inst_plaud',
    tenant: { userId: 'u_test' },
  } as MessageBase);
  const opened = await waitForType('session_opened');
  received.length = 0;
  return opened.sessionId as string;
}

// ---------------------------------------------------------------------------
// Integration test setup / teardown
// ---------------------------------------------------------------------------

describe('PLAUD Agent App — integration', () => {
  beforeEach(() => {
    const runtime = new InProcessRuntime(factory);
    appStation = new AppStation({
      appId: 'app.plaud',
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
            ACCESS_TOKEN: 'test-plaud-token',
            REFRESH_TOKEN: 'test-refresh',
            EXPIRY_DATE: '2026-12-31T00:00:00.000Z',
          },
        } as MessageBase);
      }
    });

    appStation.accept(ctrlSide);
  });

  afterEach(async () => {
    await appStation.shutdown();
  });

  it('lists all 7 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'download-recording',
      'get-current-user',
      'get-note',
      'get-transcript',
      'list-notes',
      'list-tags',
      'search-notes',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: secret resolution (from plaud-client.test.ts + oauth-provider.test.ts)
// ---------------------------------------------------------------------------

function createMockSecretsContext(
  overrides: { installationSecrets?: Record<string, string> } = {},
): SecretsContext {
  return {
    secrets: {
      getSystem: async () => ({}),
      getInstallation: async () => overrides.installationSecrets ?? {},
    },
  };
}

describe('getPlaudSecrets', () => {
  it('uses defaults when no secrets are provided', async () => {
    const context = createMockSecretsContext();
    const secrets = await getPlaudSecrets(context);
    expect(secrets.PLAUD_MCP_URL).toBe('https://mcp.plaud.ai/mcp');
    expect(secrets.ACCESS_TOKEN).toBeUndefined();
    expect(secrets.REFRESH_TOKEN).toBeUndefined();
  });

  it('strips trailing slash from PLAUD_MCP_URL', async () => {
    const context = createMockSecretsContext({
      installationSecrets: { PLAUD_MCP_URL: 'https://mcp.plaud.ai/mcp/' },
    });
    const secrets = await getPlaudSecrets(context);
    expect(secrets.PLAUD_MCP_URL).toBe('https://mcp.plaud.ai/mcp');
  });

  it('reads backend OAuth tokens from installation secrets', async () => {
    const context = createMockSecretsContext({
      installationSecrets: {
        ACCESS_TOKEN: 'backend-token',
        REFRESH_TOKEN: 'backend-refresh',
        EXPIRY_DATE: '2026-06-25T12:00:00.000Z',
      },
    });
    const secrets = await getPlaudSecrets(context);
    expect(secrets.ACCESS_TOKEN).toBe('backend-token');
    expect(secrets.REFRESH_TOKEN).toBe('backend-refresh');
    expect(secrets.EXPIRY_DATE).toBe('2026-06-25T12:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: PlaudClient construction (from oauth-provider.test.ts + plaud-client.test.ts)
// ---------------------------------------------------------------------------

describe('PlaudClient with backend OAuth tokens', () => {
  it('creates a PlaudClient without OAuth tokens', async () => {
    const context = createMockSecretsContext();
    const client = await getPlaudClient(context);
    expect(client).toBeInstanceOf(PlaudClient);
  });

  it('reads OAuth tokens from installation secrets and creates client', async () => {
    const context = createMockSecretsContext({
      installationSecrets: {
        ACCESS_TOKEN: 'token_123',
        REFRESH_TOKEN: 'refresh_123',
        EXPIRY_DATE: '2026-06-25T12:00:00.000Z',
      },
    });
    const client = await getPlaudClient(context);
    expect(client).toBeInstanceOf(PlaudClient);
  });

  it('persists the default MCP URL in the client secrets', async () => {
    const context = createMockSecretsContext();
    const client = await getPlaudClient(context);

    // Access the internal secrets via reflection
    const secrets = (client as any).secrets;
    expect(secrets).toBeDefined();
    expect(secrets.PLAUD_MCP_URL).toBe('https://mcp.plaud.ai/mcp');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: data mappers (from plaud-client.test.ts)
// ---------------------------------------------------------------------------

describe('mapRecording', () => {
  it('maps the official MCP file fields', () => {
    const raw = {
      id: 'abc123',
      name: 'Meeting',
      created_at: '2026-06-01T10:00:00Z',
      duration: 120_000,
      tag_name: 'Work',
    };
    expect(mapRecording(raw)).toEqual({
      id: 'abc123',
      title: 'Meeting',
      created_at: '2026-06-01T10:00:00Z',
      start_at: undefined,
      duration_seconds: 120,
      serial_number: undefined,
      tag: 'Work',
    });
  });

  it('falls back to alternative field names', () => {
    const raw = {
      file_id: 'def456',
      file_name: 'Call',
      createTime: '2026-06-02T12:00:00Z',
      durationSeconds: 60,
      folder: 'Personal',
    };
    const rec = mapRecording(raw as unknown as Record<string, unknown>);
    expect(rec.id).toBe('def456');
    expect(rec.title).toBe('Call');
    expect(rec.created_at).toBe('2026-06-02T12:00:00Z');
    expect(rec.duration_seconds).toBe(60);
    expect(rec.tag).toBe('Personal');
  });

  it('converts duration from milliseconds to seconds', () => {
    const raw = {
      id: 'ghi789',
      name: 'Short call',
      created_at: '2026-06-03T10:00:00Z',
      duration: 30_000,
    };
    expect(mapRecording(raw).duration_seconds).toBe(30);
  });
});

describe('mapSegments', () => {
  it('maps segments with speaker labels', () => {
    const raw = [
      { text: 'Hello', start_time: 0, end_time: 1, speaker: 'A' },
      { content: 'Hi', start: 1, end: 2, speaker_label: 'B' },
    ];
    const segments = mapSegments(raw);
    expect(segments).toEqual([
      { text: 'Hello', start_time: 0, end_time: 1, speaker: 'A' },
      { text: 'Hi', start_time: 1, end_time: 2, speaker: 'B' },
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(mapSegments(null)).toEqual([]);
    expect(mapSegments('text')).toEqual([]);
  });
});

describe('mapNoteDetail', () => {
  it('concatenates transcript segments', () => {
    const raw = {
      id: 'abc',
      name: 'Note',
      created_at: '2026-06-01T10:00:00Z',
      duration: 30_000,
      source_list: [
        { text: 'One', start_time: 0, end_time: 1 },
        { text: 'two', start_time: 1, end_time: 2 },
      ],
      note_list: ['# Summary', 'Key points discussed.'],
    };
    const note = mapNoteDetail(raw);
    expect(note.transcript).toBe('One two');
    expect(note.segments).toHaveLength(2);
    expect(note.duration_seconds).toBe(30);
    expect(note.ai_content).toEqual(['# Summary', 'Key points discussed.']);
  });
});

describe('mapTag', () => {
  it('maps tag fields', () => {
    const raw = { tag_id: 't1', tag_name: 'Ideas', file_count: 5 };
    expect(mapTag(raw)).toEqual({ id: 't1', name: 'Ideas', count: 5 });
  });
});

describe('mapUser', () => {
  it('maps user fields', () => {
    const raw = { user_id: 'u1', email: 'u@example.com', name: 'User' };
    expect(mapUser(raw)).toEqual({ id: 'u1', email: 'u@example.com', name: 'User' });
  });
});
