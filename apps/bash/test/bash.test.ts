/**
 * Tests for the Bash Agent App.
 *
 * These tests execute real bash commands (echo, cat, etc.) — no mocking needed
 * since bash is a local system primitive.
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
import factory from '../src/app.js';

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
    installationId: 'inst_bash',
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
    context: { userId: 'u_test', installationId: 'inst_bash' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.bash',
    appVersion: '1.0.0',
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
        secrets: {},
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

describe('Bash Agent App', () => {
  it('lists the bash tool', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name)).toEqual(['bash']);
  });

  it('health check reports ready', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('executes echo and returns stdout', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'bash', {
      command: 'echo "hello world"',
      description: 'Test echo',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect((data.stdout as string).trim()).toBe('hello world');
    expect(data.exitCode).toBe(0);
    expect(data.command).toBe('echo "hello world"');
  });

  it('captures stderr on failing commands', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'bash', {
      command: 'ls /nonexistent_path_12345',
      description: 'List nonexistent directory',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.exitCode).not.toBe(0);
    expect((data.stderr as string).length).toBeGreaterThan(0);
  });

  it('respects cwd parameter', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'bash', {
      command: 'pwd',
      description: 'Print working directory',
      cwd: '/tmp',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    // /tmp may resolve to /private/tmp on macOS
    expect((data.stdout as string).trim()).toMatch(/\/?tmp$/);
    expect(data.cwd).toBe('/tmp');
  });

  it('returns duration', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'bash', {
      command: 'echo fast',
      description: 'Fast command',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.duration).toMatch(/^\d+ms$/);
  });

  it('handles multiline output', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'bash', {
      command: 'echo -e "line1\\nline2\\nline3"',
      description: 'Multiline echo',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const lines = (data.stdout as string).trim().split('\n');
    expect(lines).toHaveLength(3);
  });

  it('handles empty command output gracefully', async () => {
    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'bash', {
      command: 'true',
      description: 'No-output command',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.stdout).toBe('(no output)');
    expect(data.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Workspace Volume in mount mode (docs/specs/volume.md)
// ---------------------------------------------------------------------------

describe('Bash on the Workspace Volume', () => {
  it('[VOL-AC-4] cat in the mounted Volume prints what another app wrote through the API', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { handleVolumeRequest, LocalVolumeStore, resolveMountPath } = await import(
      '@agentapps/station'
    );
    const manifest = (await import('../agentapp.json', { with: { type: 'json' } })).default as {
      runtime: { mountVolume?: boolean };
      permissions?: { volume?: boolean };
    };

    const base = await mkdtemp(join(tmpdir(), 'vol-bash-'));
    try {
      // Another app writes notes.md through API mode (VOL-REQ-3).
      const written = await handleVolumeRequest(
        {
          volume: new LocalVolumeStore(base),
          workspaceId: 'hexagon',
          sessionId: 'writer',
          permissions: { volume: true },
        },
        {
          type: 'file_volume_write_file',
          sessionId: 'writer',
          requestId: 'w1',
          path: 'notes.md',
          data: Buffer.from('from the API').toString('base64'),
        },
      );
      expect(written?.success).toBe(true);

      // Bash, as its manifest declares it, is spawned with the Volume mounted.
      await appStation.shutdown();
      appStation = new AppStation({
        appId: 'app.bash',
        appVersion: '1.0.0',
        runtime: new InProcessRuntime(factory),
        resolveMountPath: () =>
          resolveMountPath({
            mountVolume: manifest.runtime.mountVolume,
            permissions: manifest.permissions,
            volume: new LocalVolumeStore(base),
            workspaceId: 'hexagon',
          }),
      });
      const [hostSide, ctrlSide] = createInProcessTransportPair();
      host = hostSide;
      received = collectMessages(host);
      appStation.accept(ctrlSide);

      const sessionId = await initAndOpen();
      sendToolCall(sessionId, 'bash', {
        command: 'cat $AGENTAPPS_VOLUME_PATH/notes.md',
        description: 'read notes',
        cwd: tmpdir(),
      });
      const result = await waitForType('tool_result');
      expect(result.success).toBe(true);
      expect(JSON.stringify(result.result)).toContain('from the API');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
