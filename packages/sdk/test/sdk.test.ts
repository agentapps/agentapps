/**
 * Tests for @agentapps/sdk — the app authoring layer.
 *
 * Each test creates a transport pair: one side is the "host" (test harness),
 * the other is passed to the SDK factory. Messages flow host ↔ SDK instance
 * exactly as they would through the app station.
 */

import {
  createInProcessTransportPair,
  createSessionEnvelope,
  ErrorCode,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const SESSION_ID = 'sess_test_1';

/** Wait for a message matching a predicate, with timeout. */
function waitFor(
  transport: Transport,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 2_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`Timeout waiting for message (${timeoutMs}ms)`));
    }, timeoutMs);
    const unsub = transport.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (predicate(m)) {
        clearTimeout(timer);
        unsub();
        resolve(m);
      }
    });
  });
}

/** Create a session-plane message for testing. */
function sessionMsg(type: string, extra: Record<string, unknown> = {}): MessageBase {
  return {
    ...createSessionEnvelope(type, SESSION_ID),
    ...extra,
  } as MessageBase;
}

/** Build a simple test app with one tool. */
function createTestApp() {
  const app = createApp({ id: 'app.test', version: '1.0.0' });
  app.tool('greet', {
    description: 'Greets someone by name',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Name to greet' } },
      required: ['name'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args) => ({ greeting: `Hello, ${args.name}!` }),
  });
  return app;
}

// ---------------------------------------------------------------------------
// Builder tests
// ---------------------------------------------------------------------------

describe('AgentApp builder', () => {
  it('creates an app and registers tools', () => {
    const app = createTestApp();
    expect(app.config.id).toBe('app.test');
    expect(app._tools.size).toBe(1);
    expect(app._tools.has('greet')).toBe(true);
  });

  it('chains tool and health registrations', () => {
    const app = createApp({ id: 'app.chain', version: '0.1.0' })
      .tool('a', {
        description: 'Tool A',
        parameters: { type: 'object', properties: {} },
        handler: async () => 'a',
      })
      .tool('b', {
        description: 'Tool B',
        parameters: { type: 'object', properties: {} },
        handler: async () => 'b',
      })
      .health(async () => ({ status: 'ready' }));

    expect(app._tools.size).toBe(2);
    expect(app._healthHandler).not.toBeNull();
  });

  it('rejects duplicate tool names', () => {
    const app = createApp({ id: 'app.dup', version: '0.1.0' });
    app.tool('dup', {
      description: 'First',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });
    expect(() =>
      app.tool('dup', {
        description: 'Second',
        parameters: { type: 'object', properties: {} },
        handler: async () => null,
      }),
    ).toThrow("Tool 'dup' is already registered");
  });

  it('toFactory() returns a function', () => {
    const factory = createTestApp().toFactory();
    expect(typeof factory).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// list_tools
// ---------------------------------------------------------------------------

describe('list_tools', () => {
  it('returns registered tools', async () => {
    const [hostSide, appSide] = createInProcessTransportPair();
    const app = createTestApp();
    app.toFactory()(appSide);

    const reqId = 'lt_1';
    const response = waitFor(hostSide, (m) => m.type === 'tools_list');
    hostSide.send(sessionMsg('list_tools', { id: reqId }));

    const msg = await response;
    expect(msg.id).toBe(reqId);
    expect(msg.type).toBe('tools_list');
    expect(msg.sessionId).toBe(SESSION_ID);

    const tools = msg.tools as Array<Record<string, unknown>>;
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('greet');
    expect(tools[0].description).toBe('Greets someone by name');
    expect(tools[0].annotations).toEqual({ readOnlyHint: true });
  });

  it('returns empty list when no tools registered', async () => {
    const [hostSide, appSide] = createInProcessTransportPair();
    createApp({ id: 'app.empty', version: '0.1.0' }).toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'tools_list');
    hostSide.send(sessionMsg('list_tools', { id: 'lt_empty' }));

    const msg = await response;
    expect((msg.tools as unknown[]).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// tool_call
// ---------------------------------------------------------------------------

describe('tool_call', () => {
  it('executes a tool and returns the result', async () => {
    const [hostSide, appSide] = createInProcessTransportPair();
    createTestApp().toFactory()(appSide);

    const reqId = 'tc_1';
    const response = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: reqId,
        tool: 'greet',
        arguments: { name: 'World' },
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await response;
    expect(msg.id).toBe(reqId);
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({ greeting: 'Hello, World!' });
    expect(typeof msg.duration).toBe('number');
    expect(msg.sessionId).toBe(SESSION_ID);
  });

  it('returns TOOL_NOT_FOUND for unknown tools', async () => {
    const [hostSide, appSide] = createInProcessTransportPair();
    createTestApp().toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_404',
        tool: 'nonexistent',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await response;
    expect(msg.success).toBe(false);
    const error = msg.error as Record<string, unknown>;
    expect(error.code).toBe(ErrorCode.TOOL_NOT_FOUND);
  });

  it('returns INTERNAL_ERROR when the handler throws', async () => {
    const app = createApp({ id: 'app.err', version: '0.1.0' });
    app.tool('boom', {
      description: 'Always throws',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        throw new Error('kaboom');
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_err',
        tool: 'boom',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await response;
    expect(msg.success).toBe(false);
    const error = msg.error as Record<string, unknown>;
    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(error.message).toBe('kaboom');
    expect(typeof msg.duration).toBe('number');
  });

  it('passes execution context to the handler', async () => {
    let capturedContext: Record<string, unknown> | null = null;
    const app = createApp({ id: 'app.ctx', version: '0.1.0' });
    app.tool('capture', {
      description: 'Captures context',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        capturedContext = ctx.execution as unknown as Record<string, unknown>;
        return 'ok';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_ctx',
        tool: 'capture',
        arguments: {},
        context: { userId: 'u42', workspaceId: 'ws_7', installationId: 'inst_ctx' },
      }),
    );

    await response;
    expect(capturedContext).not.toBeNull();
    expect(capturedContext?.userId).toBe('u42');
    expect(capturedContext?.workspaceId).toBe('ws_7');
    expect(capturedContext?.installationId).toBe('inst_ctx');
  });
});

// ---------------------------------------------------------------------------
// health_check
// ---------------------------------------------------------------------------

describe('health_check', () => {
  it('returns default ready when no health handler is set', async () => {
    const app = createApp({ id: 'app.nohealth', version: '1.0.0' });
    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'health_status');
    hostSide.send(sessionMsg('health_check', { id: 'hc_default' }));

    const msg = await response;
    expect(msg.id).toBe('hc_default');
    expect(msg.status).toBe('ready');
    expect(typeof msg.uptime).toBe('number');
    expect(msg.version).toBe('1.0.0');
  });

  it('runs the custom health handler', async () => {
    const app = createApp({ id: 'app.health', version: '2.0.0' });
    app.health(async () => ({
      status: 'degraded',
      message: 'Missing OAuth token',
      issues: [{ code: 'OAUTH_MISSING', message: 'No token', severity: 'error' as const }],
    }));

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'health_status');
    hostSide.send(sessionMsg('health_check', { id: 'hc_custom' }));

    const msg = await response;
    expect(msg.status).toBe('degraded');
    expect(msg.message).toBe('Missing OAuth token');
    const issues = msg.issues as Array<Record<string, unknown>>;
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('OAUTH_MISSING');
    expect(msg.version).toBe('2.0.0');
  });

  it('returns degraded when health handler throws', async () => {
    const app = createApp({ id: 'app.healtherr', version: '1.0.0' });
    app.health(async () => {
      throw new Error('check failed');
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'health_status');
    hostSide.send(sessionMsg('health_check', { id: 'hc_err' }));

    const msg = await response;
    expect(msg.status).toBe('degraded');
    expect(msg.message as string).toContain('check failed');
  });
});

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

describe('cancel', () => {
  it('aborts an in-flight tool call', async () => {
    let signalAborted = false;

    const app = createApp({ id: 'app.cancel', version: '1.0.0' });
    app.tool('slow', {
      description: 'A slow tool',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        // Wait until aborted
        await new Promise<void>((resolve) => {
          ctx.signal.addEventListener('abort', () => {
            signalAborted = true;
            resolve();
          });
        });
        return 'done';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const toolReqId = 'tc_slow';

    // Start the slow tool (don't await — it will block)
    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result' && m.id === toolReqId);

    hostSide.send(
      sessionMsg('tool_call', {
        id: toolReqId,
        tool: 'slow',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    // Give the handler a tick to start
    await new Promise((r) => setTimeout(r, 10));

    // Send cancel
    const cancelResult = waitFor(hostSide, (m) => m.type === 'cancel_result');
    hostSide.send(
      sessionMsg('cancel', {
        id: 'cancel_1',
        requestId: toolReqId,
        reason: 'User cancelled',
      }),
    );

    const cancelMsg = await cancelResult;
    expect(cancelMsg.cancelled).toBe(true);
    expect(cancelMsg.requestId).toBe(toolReqId);

    // The tool should also complete (with the result after abort)
    const resultMsg = await toolResult;
    expect(resultMsg.success).toBe(true);
    expect(signalAborted).toBe(true);
  });

  it('returns cancelled: false for unknown request id', async () => {
    const [hostSide, appSide] = createInProcessTransportPair();
    createApp({ id: 'app.c', version: '0.1.0' }).toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'cancel_result');
    hostSide.send(
      sessionMsg('cancel', {
        id: 'cancel_unknown',
        requestId: 'nonexistent',
      }),
    );

    const msg = await response;
    expect(msg.cancelled).toBe(false);
    expect(msg.reason).toBe('Request not found or already completed');
  });
});

// ---------------------------------------------------------------------------
// shutdown
// ---------------------------------------------------------------------------

describe('shutdown', () => {
  it('responds with shutdown_ack', async () => {
    const [hostSide, appSide] = createInProcessTransportPair();
    createTestApp().toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'shutdown_ack');
    hostSide.send(sessionMsg('shutdown', { id: 'sd_1', gracePeriod: 5000 }));

    const msg = await response;
    expect(msg.id).toBe('sd_1');
    expect(msg.type).toBe('shutdown_ack');
  });
});

// ---------------------------------------------------------------------------
// Secret requests (REQ-7)
// ---------------------------------------------------------------------------

describe('secret requests', () => {
  it('retrieves installation secrets via request', async () => {
    const app = createApp({ id: 'app.secrets', version: '1.0.0' });
    app.tool('need-secrets', {
      description: 'Needs installation secrets',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const secrets = await ctx.secrets.getInstallation();
        return { hasSecrets: secrets !== null, token: secrets?.API_TOKEN };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Listen for the request request from the SDK
    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'get_installation_secrets') {
        // Respond with secrets
        hostSide.send({
          ...createSessionEnvelope('installation_secrets', SESSION_ID),
          requestId: m.requestId as string,
          secrets: { API_TOKEN: 'tok_123' },
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_secrets',
        tool: 'need-secrets',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({ hasSecrets: true, token: 'tok_123' });
  });

  it('retrieves system secrets via request', async () => {
    const app = createApp({ id: 'app.sys', version: '1.0.0' });
    app.tool('sys-secrets', {
      description: 'Needs system secrets',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const secrets = await ctx.secrets.getSystem();
        return { apiKey: secrets?.SYS_KEY };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'get_system_secrets') {
        hostSide.send({
          ...createSessionEnvelope('system_secrets', SESSION_ID),
          requestId: m.requestId as string,
          secrets: { SYS_KEY: 'key_abc' },
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_sys',
        tool: 'sys-secrets',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({ apiKey: 'key_abc' });
  });

  it('updates installation secrets via request', async () => {
    let updatedSecrets: Record<string, string> | null = null;

    const app = createApp({ id: 'app.update', version: '1.0.0' });
    app.tool('refresh-token', {
      description: 'Refreshes and saves a token',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        await ctx.secrets.updateInstallation({ NEW_TOKEN: 'refreshed_123' });
        return 'updated';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'update_installation_secrets') {
        updatedSecrets = m.secrets as Record<string, string>;
        hostSide.send({
          ...createSessionEnvelope('update_installation_secrets_response', SESSION_ID),
          requestId: m.requestId as string,
          success: true,
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_update',
        tool: 'refresh-token',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(updatedSecrets).toEqual({ NEW_TOKEN: 'refreshed_123' });
  });
});

// ---------------------------------------------------------------------------
// Events (log, progress, stream)
// ---------------------------------------------------------------------------

describe('events', () => {
  it('emits log events from tool handler', async () => {
    const app = createApp({ id: 'app.log', version: '1.0.0' });
    app.tool('logging', {
      description: 'Logs things',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        ctx.log('info', 'Starting work', { step: 1 });
        return 'done';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const logEvent = waitFor(hostSide, (m) => m.type === 'log');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_log',
        tool: 'logging',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await logEvent;
    expect(msg.level).toBe('info');
    expect(msg.message).toBe('Starting work');
    expect(msg.data).toEqual({ step: 1 });
    expect(msg.sessionId).toBe(SESSION_ID);
  });

  it('emits progress events', async () => {
    const app = createApp({ id: 'app.prog', version: '1.0.0' });
    app.tool('slow-work', {
      description: 'Reports progress',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        ctx.progress(50, 'Half done', 5000);
        return 'done';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const progressEvent = waitFor(hostSide, (m) => m.type === 'tool_progress');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_prog',
        tool: 'slow-work',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await progressEvent;
    expect(msg.progress).toBe(50);
    expect(msg.status).toBe('Half done');
    expect(msg.eta).toBe(5000);
    expect(msg.requestId).toBe('tc_prog');
  });

  it('emits stream chunks', async () => {
    const app = createApp({ id: 'app.stream', version: '1.0.0' });
    app.tool('streamer', {
      description: 'Streams text',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        ctx.stream('Hello, ');
        ctx.stream('World!', true);
        return null;
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const chunks: Record<string, unknown>[] = [];
    const allDone = new Promise<void>((resolve) => {
      hostSide.onMessage((msg) => {
        const m = msg as Record<string, unknown>;
        if (m.type === 'tool_stream') {
          chunks.push(m);
          if (m.done) resolve();
        }
      });
    });

    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_stream',
        tool: 'streamer',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    await allDone;
    expect(chunks).toHaveLength(2);
    expect(chunks[0].chunk).toBe('Hello, ');
    expect(chunks[0].done).toBe(false);
    expect(chunks[1].chunk).toBe('World!');
    expect(chunks[1].done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Health check with secrets request
// ---------------------------------------------------------------------------

describe('health check with requests', () => {
  it('health handler can access secrets', async () => {
    const app = createApp({ id: 'app.healthsec', version: '1.0.0' });
    app.health(async (ctx) => {
      const secrets = await ctx.secrets.getSystem();
      if (secrets?.API_KEY) {
        return { status: 'ready', message: 'API key present' };
      }
      return { status: 'not_ready', message: 'Missing API key' };
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Respond to system secrets request
    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'get_system_secrets') {
        hostSide.send({
          ...createSessionEnvelope('system_secrets', SESSION_ID),
          requestId: m.requestId as string,
          secrets: { API_KEY: 'key_present' },
        } as MessageBase);
      }
    });

    const response = waitFor(hostSide, (m) => m.type === 'health_status');
    hostSide.send(sessionMsg('health_check', { id: 'hc_sec' }));

    const msg = await response;
    expect(msg.status).toBe('ready');
    expect(msg.message).toBe('API key present');
  });
});

// ---------------------------------------------------------------------------
// Subscribe/unsubscribe/credentials_updated handling
// ---------------------------------------------------------------------------

describe('event subscription handling', () => {
  it('rejects subscribe for unregistered event types', async () => {
    const app = createTestApp();
    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const resp = waitFor(hostSide, (m) => m.type === 'subscribe_result');
    hostSide.send(
      sessionMsg('subscribe', {
        id: 'sub_1',
        eventTypes: ['unregistered_event'],
      }),
    );

    const msg = await resp;
    expect(msg.success).toBe(false);
    expect(msg.error).toContain('not registered');
  });

  it('accepts unsubscribe for any subscription id', async () => {
    const app = createTestApp();
    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const resp = waitFor(hostSide, (m) => m.type === 'unsubscribe_result');
    hostSide.send(
      sessionMsg('unsubscribe', {
        id: 'unsub_1',
        subscriptionId: 'sub_abc',
      }),
    );

    const msg = await resp;
    expect(msg.success).toBe(true);
    expect(msg.subscriptionId).toBe('sub_abc');
  });

  it('silently handles credentials_updated (no error, no response)', async () => {
    const app = createTestApp();
    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Send credentials_updated — should not produce an error
    hostSide.send(
      sessionMsg('credentials_updated', {
        id: 'cred_1',
        credentials: { API_KEY: 'new_key' },
      }),
    );

    // Send a tool_call to verify the instance is still healthy
    const resp = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_after_cred',
        tool: 'greet',
        arguments: { name: 'World' },
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await resp;
    expect(msg.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: SDK app through the app station
// ---------------------------------------------------------------------------

describe('end-to-end with appStation', async () => {
  // Dynamic import to avoid circular dependency at test-gather time
  const { AppStation, InProcessRuntime } = await import('@agentapps/station');

  it('SDK app works through the full appStation lifecycle', async () => {
    // Build an app using the SDK
    const app = createApp({ id: 'app.e2e', version: '1.0.0' });
    app.tool('add', {
      description: 'Adds two numbers',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['a', 'b'],
      },
      handler: async (args) => ({ sum: (args.a as number) + (args.b as number) }),
    });
    app.health(async () => ({ status: 'ready' }));

    // Wire through the app station
    const runtime = new InProcessRuntime(app.toFactory());
    const appStation = new AppStation({
      appId: 'app.e2e',
      appVersion: '1.0.0',
      runtime,
    });

    const [hostSide, controllerSide] = createInProcessTransportPair();
    appStation.accept(controllerSide);

    try {
      // 1. Initialize
      const initResp = waitFor(hostSide, (m) => m.type === 'initialized');
      hostSide.send({
        ...createSessionEnvelope('initialize'),
        supportedVersions: [PROTOCOL_VERSION],
      } as MessageBase);
      const initMsg = await initResp;
      expect(initMsg.negotiatedVersion).toBe(PROTOCOL_VERSION);

      // 2. Open session
      const openResp = waitFor(hostSide, (m) => m.type === 'session_opened');
      hostSide.send({
        ...createSessionEnvelope('session_open'),
        installationId: 'inst_e2e',
        tenant: { userId: 'u_e2e' },
      } as MessageBase);
      const openMsg = await openResp;
      const sessionId = openMsg.sessionId as string;
      expect(sessionId).toBeTruthy();

      // 3. List tools (through app station → SDK instance)
      const listResp = waitFor(hostSide, (m) => m.type === 'tools_list');
      hostSide.send({
        ...createSessionEnvelope('list_tools', sessionId),
      } as MessageBase);
      const listMsg = await listResp;
      const tools = listMsg.tools as Array<Record<string, unknown>>;
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('add');

      // 4. Call tool (through app station → SDK instance)
      const callResp = waitFor(hostSide, (m) => m.type === 'tool_result');
      hostSide.send({
        ...createSessionEnvelope('tool_call', sessionId),
        tool: 'add',
        arguments: { a: 3, b: 7 },
        context: { userId: 'u_e2e', installationId: 'inst_e2e' },
      } as MessageBase);
      const callMsg = await callResp;
      expect(callMsg.success).toBe(true);
      expect(callMsg.result).toEqual({ sum: 10 });

      // 5. Health check (through app station → SDK instance)
      const healthResp = waitFor(hostSide, (m) => m.type === 'health_status');
      hostSide.send({
        ...createSessionEnvelope('health_check', sessionId),
      } as MessageBase);
      const healthMsg = await healthResp;
      expect(healthMsg.status).toBe('ready');
      expect(healthMsg.version).toBe('1.0.0');

      // 6. Close session
      const closeResp = waitFor(hostSide, (m) => m.type === 'session_closed');
      hostSide.send({
        ...createSessionEnvelope('session_close'),
        sessionId,
      } as MessageBase);
      await closeResp;
    } finally {
      await appStation.shutdown();
    }
  });
});
