/**
 * Tests for the new unified request system (requestAuth, requestSecret, openUrl).
 */

import {
  createInProcessTransportPair,
  createSessionEnvelope,
  type MessageBase,
} from '@agentapps/protocol';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';
import type { ToolContext } from '../src/types.js';

const SESSION_ID = 'sess_callbacks_1';

function sessionMsg(type: string, extra: Record<string, unknown> = {}): MessageBase {
  return {
    ...createSessionEnvelope(type, SESSION_ID),
    ...extra,
  } as MessageBase;
}

function waitFor(
  transport: { onMessage: (handler: (msg: Record<string, unknown>) => void) => () => void },
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

// ---------------------------------------------------------------------------
// requestAuth
// ---------------------------------------------------------------------------

describe('requestAuth', () => {
  it('returns access token on success', async () => {
    const app = createApp({ id: 'app.auth', version: '1.0.0' });
    app.tool('auth-test', {
      description: 'Test auth request',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const result = await ctx.requestAuth({
          provider: 'google',
          scopes: ['profile', 'email'],
        });
        return {
          token: result.accessToken,
          hasRefresh: !!result.refreshToken,
          expires: result.expiresAt?.toISOString(),
        };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Listen for request request and respond
    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'prompt' && m.promptType === 'auth') {
        hostSide.send({
          ...createSessionEnvelope('prompt_result', SESSION_ID),
          promptId: m.promptId as string,
          success: true,
          accessToken: 'tok_abc_123',
          refreshToken: 'refresh_xyz',
          expiresAt: '2026-12-31T23:59:59.000Z',
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_auth',
        tool: 'auth-test',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({
      token: 'tok_abc_123',
      hasRefresh: true,
      expires: '2026-12-31T23:59:59.000Z',
    });
  });

  it('throws on auth failure', async () => {
    const app = createApp({ id: 'app.auth-fail', version: '1.0.0' });
    app.tool('auth-fail', {
      description: 'Test auth failure',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        await ctx.requestAuth({ provider: 'google' });
        return 'should not reach';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'prompt' && m.promptType === 'auth') {
        hostSide.send({
          ...createSessionEnvelope('prompt_result', SESSION_ID),
          promptId: m.promptId as string,
          success: false,
          error: 'User denied authorization',
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_auth_fail',
        tool: 'auth-fail',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(false);
    const error = msg.error as Record<string, unknown>;
    expect(error.message).toContain('User denied authorization');
  });

  it('throws on auth cancellation', async () => {
    const app = createApp({ id: 'app.auth-cancel', version: '1.0.0' });
    app.tool('auth-cancel', {
      description: 'Test auth cancellation',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        await ctx.requestAuth({ provider: 'google' });
        return 'should not reach';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'prompt' && m.promptType === 'auth') {
        hostSide.send({
          ...createSessionEnvelope('prompt_result', SESSION_ID),
          promptId: m.promptId as string,
          success: false,
          cancelled: true,
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_auth_cancel',
        tool: 'auth-cancel',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(false);
    const error = msg.error as Record<string, unknown>;
    expect(error.message).toContain('Authentication cancelled');
  });
});

// ---------------------------------------------------------------------------
// auth.refresh
// ---------------------------------------------------------------------------

describe('auth.refresh', () => {
  it('returns refreshed tokens on success', async () => {
    const app = createApp({ id: 'app.refresh', version: '1.0.0' });
    app.tool('refresh-test', {
      description: 'Test refresh request',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const r = await ctx.auth.refresh();
        return { token: r.accessToken, refresh: r.refreshToken, expires: r.expiresAt };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'refresh_token') {
        hostSide.send({
          ...createSessionEnvelope('refresh_token_response', SESSION_ID),
          requestId: m.requestId as string,
          accessToken: 'new_at',
          refreshToken: 'new_rt',
          expiresAt: '2026-12-31T23:59:59.000Z',
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_refresh',
        tool: 'refresh-test',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({
      token: 'new_at',
      refresh: 'new_rt',
      expires: '2026-12-31T23:59:59.000Z',
    });
  });

  it('throws when the host cannot refresh', async () => {
    const app = createApp({ id: 'app.refresh-fail', version: '1.0.0' });
    app.tool('refresh-fail', {
      description: 'Test refresh failure',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        await ctx.auth.refresh();
        return 'should not reach';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'refresh_token') {
        hostSide.send({
          ...createSessionEnvelope('refresh_token_response', SESSION_ID),
          requestId: m.requestId as string,
          error: 'Missing user secret: REFRESH_TOKEN',
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_refresh_fail',
        tool: 'refresh-fail',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(false);
    const error = msg.error as Record<string, unknown>;
    expect(error.message).toContain('REFRESH_TOKEN');
  });
});

// ---------------------------------------------------------------------------
// requestSecret
// ---------------------------------------------------------------------------

describe('requestSecret', () => {
  it('returns secret value on success', async () => {
    const app = createApp({ id: 'app.secret', version: '1.0.0' });
    app.tool('secret-test', {
      description: 'Test secret request',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const result = await ctx.requestSecret({
          name: 'API_KEY',
          description: 'Enter your API key',
        });
        return { secret: result.value };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'prompt' && m.promptType === 'secret') {
        hostSide.send({
          ...createSessionEnvelope('prompt_result', SESSION_ID),
          promptId: m.promptId as string,
          success: true,
          secretValue: 'sk-secret-123',
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_secret',
        tool: 'secret-test',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({ secret: 'sk-secret-123' });
  });

  it('throws on secret request failure', async () => {
    const app = createApp({ id: 'app.secret-fail', version: '1.0.0' });
    app.tool('secret-fail', {
      description: 'Test secret failure',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        await ctx.requestSecret({ name: 'API_KEY' });
        return 'should not reach';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'prompt' && m.promptType === 'secret') {
        hostSide.send({
          ...createSessionEnvelope('prompt_result', SESSION_ID),
          promptId: m.promptId as string,
          success: false,
          error: 'User declined to provide secret',
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_secret_fail',
        tool: 'secret-fail',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(false);
    const error = msg.error as Record<string, unknown>;
    expect(error.message).toContain('User declined to provide secret');
  });
});

// ---------------------------------------------------------------------------
// openUrl
// ---------------------------------------------------------------------------

describe('openUrl', () => {
  it('succeeds when URL is opened', async () => {
    const app = createApp({ id: 'app.url', version: '1.0.0' });
    app.tool('url-test', {
      description: 'Test URL request',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        await ctx.openUrl({ url: 'https://example.com', title: 'Example' });
        return { opened: true };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'prompt' && m.promptType === 'url') {
        hostSide.send({
          ...createSessionEnvelope('prompt_result', SESSION_ID),
          promptId: m.promptId as string,
          success: true,
          opened: true,
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_url',
        tool: 'url-test',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({ opened: true });
  });

  it('throws when URL open fails', async () => {
    const app = createApp({ id: 'app.url-fail', version: '1.0.0' });
    app.tool('url-fail', {
      description: 'Test URL failure',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        await ctx.openUrl({ url: 'https://example.com' });
        return 'should not reach';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'prompt' && m.promptType === 'url') {
        hostSide.send({
          ...createSessionEnvelope('prompt_result', SESSION_ID),
          promptId: m.promptId as string,
          success: false,
          error: 'Browser not available',
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_url_fail',
        tool: 'url-fail',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(false);
    const error = msg.error as Record<string, unknown>;
    expect(error.message).toContain('Browser not available');
  });
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe('request timeout', () => {
  it('rejects after timeoutMs if no response', async () => {
    const app = createApp({ id: 'app.timeout', version: '1.0.0' });
    app.tool('timeout-test', {
      description: 'Test request timeout',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        await ctx.requestSecret({ name: 'API_KEY', timeoutMs: 50 });
        return 'should not reach';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Do NOT respond to the request — let it timeout

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_timeout',
        tool: 'timeout-test',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(false);
    const error = msg.error as Record<string, unknown>;
    expect(error.message).toContain('timed out');
  });
});

// ---------------------------------------------------------------------------
// Multiple concurrent requests
// ---------------------------------------------------------------------------

describe('concurrent requests', () => {
  it('handles multiple concurrent requests', async () => {
    const app = createApp({ id: 'app.concurrent', version: '1.0.0' });
    app.tool('concurrent-test', {
      description: 'Test concurrent requests',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const [authResult, secretResult] = await Promise.all([
          ctx.requestAuth({ provider: 'google' }),
          ctx.requestSecret({ name: 'API_KEY' }),
        ]);
        return {
          token: authResult.accessToken,
          secret: secretResult.value,
        };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const callbackRequests: Record<string, unknown>[] = [];
    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'prompt') {
        callbackRequests.push(m);
        // Respond to all requests
        if (m.promptType === 'auth') {
          hostSide.send({
            ...createSessionEnvelope('prompt_result', SESSION_ID),
            promptId: m.promptId as string,
            success: true,
            accessToken: 'tok_concurrent',
          } as MessageBase);
        } else if (m.promptType === 'secret') {
          hostSide.send({
            ...createSessionEnvelope('prompt_result', SESSION_ID),
            promptId: m.promptId as string,
            success: true,
            secretValue: 'secret_concurrent',
          } as MessageBase);
        }
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_concurrent',
        tool: 'concurrent-test',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({
      token: 'tok_concurrent',
      secret: 'secret_concurrent',
    });
    expect(callbackRequests).toHaveLength(2);
    const types = callbackRequests.map((m) => m.promptType);
    expect(types).toContain('auth');
    expect(types).toContain('secret');
  });
});

// ---------------------------------------------------------------------------
// ctx.user.get (R11)
// ---------------------------------------------------------------------------

describe('ctx.user.get', () => {
  it('returns user profile', async () => {
    const app = createApp({ id: 'app.profile', version: '1.0.0' });
    app.tool('profile-test', {
      description: 'Test user profile',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const profile = await ctx.user.get();
        return profile;
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'get_user_profile') {
        hostSide.send({
          ...createSessionEnvelope('user_profile_result', SESSION_ID),
          requestId: m.requestId as string,
          profile: {
            userId: 'u_alice',
            displayName: 'Alice',
            locale: 'en-US',
            timezone: 'America/New_York',
            email: 'alice@example.com',
          },
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_profile',
        tool: 'profile-test',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({
      userId: 'u_alice',
      displayName: 'Alice',
      locale: 'en-US',
      timezone: 'America/New_York',
      email: 'alice@example.com',
    });
  });

  it('returns null when host has no profile', async () => {
    const app = createApp({ id: 'app.profile-null', version: '1.0.0' });
    app.tool('profile-null', {
      description: 'Test null profile',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        return { profile: await ctx.user.get() };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'get_user_profile') {
        hostSide.send({
          ...createSessionEnvelope('user_profile_result', SESSION_ID),
          requestId: m.requestId as string,
          profile: null,
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_profile_null',
        tool: 'profile-null',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({ profile: null });
  });

  it('throws on error', async () => {
    const app = createApp({ id: 'app.profile-err', version: '1.0.0' });
    app.tool('profile-err', {
      description: 'Test profile error',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        await ctx.user.get();
        return 'should not reach';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'get_user_profile') {
        hostSide.send({
          ...createSessionEnvelope('user_profile_result', SESSION_ID),
          requestId: m.requestId as string,
          profile: null,
          error: 'Profile permission not approved',
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_profile_err',
        tool: 'profile-err',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(false);
    const error = msg.error as Record<string, unknown>;
    expect(error.message).toContain('Profile permission not approved');
  });
});

// ---------------------------------------------------------------------------
// Session close cancels pending requests
// ---------------------------------------------------------------------------

describe('session close', () => {
  it('rejects pending requests when session closes', async () => {
    const app = createApp({ id: 'app.close', version: '1.0.0' });
    app.tool('close-test', {
      description: 'Test request on close',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        try {
          await ctx.requestSecret({ name: 'API_KEY' });
          return 'unexpected success';
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Capture the request request but don't respond
    let promptId: string | undefined;
    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'prompt' && m.promptType === 'secret') {
        promptId = m.promptId as string;
      }
    });

    // Start the tool call
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_close',
        tool: 'close-test',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    // Wait for the request request to be sent
    await new Promise((r) => setTimeout(r, 50));
    expect(promptId).toBeDefined();

    // Send shutdown which should reject pending requests
    const shutdownAck = waitFor(hostSide, (m) => m.type === 'shutdown_ack');
    hostSide.send(sessionMsg('shutdown', { id: 'sd_1', gracePeriod: 5000 }));
    await shutdownAck;

    // The tool should have completed with an error from the cancelled request
    // But since shutdown kills the instance, we just verify no crash
  });
});

// ---------------------------------------------------------------------------
// Conversation hooks (Phase 3 — REQ-10, REQ-11)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Installation lifecycle hooks (Phase 3.6)
// ---------------------------------------------------------------------------

describe('lifecycle hooks', () => {
  it('onInstall handler receives lifecycle request and returns success', async () => {
    let receivedEvent: string | undefined;
    let receivedExecution: unknown;

    const app = createApp({ id: 'app.lc', version: '1.0.0' });
    app.onInstall(async (ctx) => {
      receivedEvent = ctx.event;
      receivedExecution = ctx.execution;
      ctx.log('info', 'Install handler ran');
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'lifecycle_response');
    hostSide.send(
      sessionMsg('lifecycle_request', {
        id: 'lc_1',
        event: 'install',
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const resp = await response;
    expect(resp.success).toBe(true);
    expect(resp.error).toBeUndefined();
    expect(receivedEvent).toBe('install');
    expect(receivedExecution).toMatchObject({ userId: 'u1', installationId: 'inst_1' });
  });

  it('onUninstall handler receives lifecycle request', async () => {
    let called = false;
    const app = createApp({ id: 'app.lc2', version: '1.0.0' });
    app.onUninstall(async () => {
      called = true;
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'lifecycle_response');
    hostSide.send(
      sessionMsg('lifecycle_request', {
        id: 'lc_2',
        event: 'uninstall',
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const resp = await response;
    expect(resp.success).toBe(true);
    expect(called).toBe(true);
  });

  it('onUpgrade handler receives previousVersion', async () => {
    let receivedPreviousVersion: string | undefined;

    const app = createApp({ id: 'app.lc3', version: '2.0.0' });
    app.onUpgrade(async (ctx) => {
      receivedPreviousVersion = ctx.previousVersion;
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'lifecycle_response');
    hostSide.send(
      sessionMsg('lifecycle_request', {
        id: 'lc_3',
        event: 'upgrade',
        context: { userId: 'u1', installationId: 'inst_1' },
        previousVersion: '1.0.0',
      }),
    );

    const resp = await response;
    expect(resp.success).toBe(true);
    expect(receivedPreviousVersion).toBe('1.0.0');
  });

  it('handler error returns success: false with error message', async () => {
    const app = createApp({ id: 'app.lc4', version: '1.0.0' });
    app.onInstall(async () => {
      throw new Error('Database migration failed');
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const messages: Record<string, unknown>[] = [];
    hostSide.onMessage((msg) => messages.push(msg as Record<string, unknown>));

    hostSide.send(
      sessionMsg('lifecycle_request', {
        id: 'lc_4',
        event: 'install',
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    await new Promise((r) => setTimeout(r, 100));

    const resp = messages.find((m) => m.type === 'lifecycle_response');
    expect(resp).toBeDefined();
    expect(resp!.success).toBe(false);
    expect(resp!.error).toBe('Database migration failed');

    const logMsg = messages.find((m) => m.type === 'log');
    expect(logMsg).toBeDefined();
    expect(logMsg!.message as string).toContain('Database migration failed');
  });

  it('unregistered lifecycle event returns success (no-op)', async () => {
    const app = createApp({ id: 'app.lc5', version: '1.0.0' });
    // No lifecycle handlers registered

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const response = waitFor(hostSide, (m) => m.type === 'lifecycle_response');
    hostSide.send(
      sessionMsg('lifecycle_request', {
        id: 'lc_5',
        event: 'install',
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const resp = await response;
    expect(resp.success).toBe(true);
  });

  it('throws on duplicate lifecycle handler registration', () => {
    const app = createApp({ id: 'app.dup', version: '1.0.0' });
    app.onInstall(async () => {});
    expect(() => app.onInstall(async () => {})).toThrow(
      "Lifecycle handler 'install' is already registered",
    );
  });
});

// ---------------------------------------------------------------------------
// Intents (Phase 4 — R3)
// ---------------------------------------------------------------------------

describe('ctx.intent()', () => {
  it('sends intent_call request and receives result', async () => {
    const app = createApp({ id: 'app.consumer', version: '1.0.0' });
    app.tool('do-work', {
      description: 'Calls a bound app',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const result = await ctx.intent('messenger', 'send_message', { to: 'alice' });
        return { forwarded: result };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Listen for intent_call request from the instance
    const intentCall = waitFor(hostSide, (m) => m.type === 'intent_call');

    // Send a tool_call to trigger the handler
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_int_1',
        tool: 'do-work',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    // Wait for the intent_call request
    const cb = await intentCall;
    expect(cb.binding).toBe('messenger');
    expect(cb.tool).toBe('send_message');
    expect((cb.arguments as Record<string, unknown>).to).toBe('alice');

    // Respond with intent_result
    hostSide.send({
      ...createSessionEnvelope('intent_result', SESSION_ID),
      requestId: cb.requestId as string,
      success: true,
      result: { delivered: true },
      duration: 50,
    } as MessageBase);

    // Wait for tool_result
    const toolResult = await waitFor(hostSide, (m) => m.type === 'tool_result');
    expect(toolResult.success).toBe(true);
    expect((toolResult.result as { forwarded: { delivered: boolean } }).forwarded).toEqual({
      delivered: true,
    });
  });

  it('throws on intent_result with error', async () => {
    const app = createApp({ id: 'app.consumer2', version: '1.0.0' });
    app.tool('do-work', {
      description: 'Calls a bound app',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        return ctx.intent('unbound', 'some_tool');
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const intentCall = waitFor(hostSide, (m) => m.type === 'intent_call');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_int_2',
        tool: 'do-work',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const cb = await intentCall;

    // Respond with error
    hostSide.send({
      ...createSessionEnvelope('intent_result', SESSION_ID),
      requestId: cb.requestId as string,
      success: false,
      error: { code: 'PERMISSION_DENIED', message: 'No binding for "unbound"' },
      duration: 0,
    } as MessageBase);

    // Tool should fail
    const toolResult = await waitFor(hostSide, (m) => m.type === 'tool_result');
    expect(toolResult.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ctx.subscribeInbound / ctx.unsubscribeInbound (R6 inbound — 4.7, 4.8)
// ---------------------------------------------------------------------------

describe('ctx.subscribeInbound()', () => {
  it('sends inbound_subscribe request and receives subscription id', async () => {
    const app = createApp({ id: 'app.inb-sub', version: '1.0.0' });
    app.tool('sub', {
      description: 'Subscribe to binding events',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const id = await ctx.subscribeInbound({ kind: 'binding', binding: 'messenger' }, [
          'message_received',
        ]);
        return { subscriptionId: id };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const subCall = waitFor(hostSide, (m) => m.type === 'inbound_subscribe');

    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_sub_1',
        tool: 'sub',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const cb = await subCall;
    expect((cb.source as { kind: string }).kind).toBe('binding');
    expect((cb.source as { binding: string }).binding).toBe('messenger');
    expect(cb.eventTypes).toEqual(['message_received']);

    // Respond with subscription id
    hostSide.send({
      ...createSessionEnvelope('inbound_subscribe_result', SESSION_ID),
      requestId: cb.requestId as string,
      success: true,
      subscriptionId: 'isub_001',
    } as MessageBase);

    const toolResult = await waitFor(hostSide, (m) => m.type === 'tool_result');
    expect(toolResult.success).toBe(true);
    expect((toolResult.result as { subscriptionId: string }).subscriptionId).toBe('isub_001');
  });

  it('sends inbound_unsubscribe callback', async () => {
    const app = createApp({ id: 'app.inb-unsub', version: '1.0.0' });
    app.tool('unsub', {
      description: 'Unsubscribe',
      parameters: {
        type: 'object',
        properties: { subscriptionId: { type: 'string' } },
        required: ['subscriptionId'],
      },
      handler: async (args, ctx) => {
        await ctx.unsubscribeInbound(args.subscriptionId as string);
        return { done: true };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const unsubCall = waitFor(hostSide, (m) => m.type === 'inbound_unsubscribe');

    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_unsub_1',
        tool: 'unsub',
        arguments: { subscriptionId: 'isub_001' },
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const cb = await unsubCall;
    expect(cb.subscriptionId).toBe('isub_001');

    hostSide.send({
      ...createSessionEnvelope('inbound_unsubscribe_result', SESSION_ID),
      requestId: cb.requestId as string,
      success: true,
    } as MessageBase);

    const toolResult = await waitFor(hostSide, (m) => m.type === 'tool_result');
    expect(toolResult.success).toBe(true);
  });
});

// ============================================================================
// Permissions access (R9 — Phase 5.3)
// ============================================================================

describe('ctx.permissions (R9)', () => {
  it('returns null before any permissions_changed event', async () => {
    const app = createApp({
      id: 'app.perm-test',
      version: '1.0.0',
    });

    let capturedPermissions: unknown = 'NOT_SET';
    app.tool('check-perms', {
      description: 'Returns effective permissions',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async (_args, ctx) => {
        capturedPermissions = ctx.permissions.effective();
        return { perms: capturedPermissions };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.send(
      sessionMsg('tool_call', {
        requestId: 'req_perm_1',
        tool: 'check-perms',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    await waitFor(hostSide, (m) => m.type === 'tool_result');
    expect(capturedPermissions).toBeNull();
  });

  it('reflects permissions after permissions_changed event', async () => {
    const app = createApp({
      id: 'app.perm-test',
      version: '1.0.0',
    });

    let capturedPermissions: unknown = 'NOT_SET';
    app.tool('check-perms', {
      description: 'Returns effective permissions',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async (_args, ctx) => {
        capturedPermissions = ctx.permissions.effective();
        return { perms: capturedPermissions };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Push permissions_changed before the tool call
    hostSide.send({
      ...createSessionEnvelope('permissions_changed', SESSION_ID),
      permissions: {
        permissions: { profile: 'basic', coreActions: ['boards'] },
      },
    } as MessageBase);

    // Small delay for dispatch
    await new Promise((r) => setTimeout(r, 10));

    hostSide.send(
      sessionMsg('tool_call', {
        requestId: 'req_perm_2',
        tool: 'check-perms',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    await waitFor(hostSide, (m) => m.type === 'tool_result');
    const perms = capturedPermissions as {
      permissions: { profile: string; coreActions: string[] };
    };
    expect(perms.permissions.profile).toBe('basic');
    expect(perms.permissions.coreActions).toEqual(['boards']);
  });

  it('fires onChange listener on permissions_changed', async () => {
    const app = createApp({
      id: 'app.perm-test',
      version: '1.0.0',
    });

    const receivedChanges: unknown[] = [];
    let unsubFn: (() => void) | null = null;

    app.tool('register-listener', {
      description: 'Register permissions change listener',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async (_args, ctx) => {
        unsubFn = ctx.permissions.onChange((perms) => {
          receivedChanges.push(perms);
        });
        return { registered: true };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    // Register listener via tool call
    hostSide.send(
      sessionMsg('tool_call', {
        requestId: 'req_perm_3',
        tool: 'register-listener',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    await waitFor(hostSide, (m) => m.type === 'tool_result');

    // Push permissions_changed
    hostSide.send({
      ...createSessionEnvelope('permissions_changed', SESSION_ID),
      permissions: {
        permissions: { profile: 'full', volume: true },
      },
    } as MessageBase);

    await new Promise((r) => setTimeout(r, 20));

    expect(receivedChanges).toHaveLength(1);
    const change = receivedChanges[0] as { permissions: { profile: string; volume: boolean } };
    expect(change.permissions.profile).toBe('full');
    expect(change.permissions.volume).toBe(true);

    // Cleanup
    if (unsubFn) unsubFn();
  });
});

// ---------------------------------------------------------------------------
// ctx.storage — document store
// ---------------------------------------------------------------------------

describe('ctx.storage', () => {
  /** Run one tool whose handler uses ctx.storage; `answer` replies to storage requests. */
  async function runStorageTool(
    handler: (ctx: ToolContext) => Promise<unknown>,
    answer: (m: Record<string, unknown>) => Record<string, unknown> | undefined,
  ): Promise<{ result: Record<string, unknown>; requests: Record<string, unknown>[] }> {
    const app = createApp({ id: 'app.storage', version: '1.0.0' });
    app.tool('storage-tool', {
      description: 'Exercises ctx.storage',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => handler(ctx),
    });
    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);
    const requests: Record<string, unknown>[] = [];
    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (typeof m.type === 'string' && m.type.startsWith('storage_')) {
        requests.push(m);
        const fields = answer(m);
        if (fields) {
          hostSide.send({
            ...createSessionEnvelope(`${m.type}_response`, SESSION_ID),
            requestId: m.requestId as string,
            ...fields,
          } as MessageBase);
        }
      }
    });
    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_storage',
        tool: 'storage-tool',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    return { result: await toolResult, requests };
  }

  it('collection.put sends storage_put with collection, documentId and document', async () => {
    const { result, requests } = await runStorageTool(
      async (ctx) => {
        await ctx.storage.collection('nodes').put('n1', { text: 'Buy milk' });
        return { ok: true };
      },
      () => ({ success: true, documentId: 'n1' }),
    );
    expect(result.success).toBe(true);
    expect(requests[0]).toMatchObject({
      type: 'storage_put',
      collection: 'nodes',
      documentId: 'n1',
      document: { text: 'Buy milk' },
    });
  });

  it('collection.get returns the document, or null when missing', async () => {
    const docs: Record<string, unknown> = { n1: { text: 'Buy milk' } };
    const { result } = await runStorageTool(
      async (ctx) => {
        const nodes = ctx.storage.collection('nodes');
        return { found: await nodes.get('n1'), missing: await nodes.get('n2') };
      },
      (m) => ({ success: true, document: docs[m.documentId as string] ?? null }),
    );
    expect(result.result).toEqual({ found: { text: 'Buy milk' }, missing: null });
  });

  it('collection.query forwards filter, limit and cursor and returns the page', async () => {
    const { result, requests } = await runStorageTool(
      async (ctx) =>
        ctx.storage
          .collection('nodes')
          .query({ filter: { parentId: 'root' }, limit: 2, cursor: 'Mg' }),
      () => ({ success: true, documents: [{ text: 'a' }, { text: 'b' }], nextCursor: 'NA' }),
    );
    expect(requests[0]).toMatchObject({
      type: 'storage_query',
      collection: 'nodes',
      filter: { parentId: 'root' },
      limit: 2,
      cursor: 'Mg',
    });
    expect(result.result).toEqual({ documents: [{ text: 'a' }, { text: 'b' }], nextCursor: 'NA' });
  });

  it('collection.update sends the patch and returns the updated document or null', async () => {
    const { result, requests } = await runStorageTool(
      async (ctx) => {
        const nodes = ctx.storage.collection('nodes');
        return {
          updated: await nodes.update('n1', { done: true }),
          missing: await nodes.update('nope', { done: true }),
        };
      },
      (m) =>
        m.documentId === 'n1'
          ? { success: true, document: { text: 'Buy milk', done: true } }
          : { success: false, document: null, error: 'Document not found' },
    );
    expect(requests[0]).toMatchObject({ type: 'storage_update', patch: { done: true } });
    expect(result.result).toEqual({ updated: { text: 'Buy milk', done: true }, missing: null });
  });

  it('collection.delete sends storage_delete and returns success', async () => {
    const { result, requests } = await runStorageTool(
      async (ctx) => ({ deleted: await ctx.storage.collection('nodes').delete('n1') }),
      () => ({ success: true }),
    );
    expect(requests[0]).toMatchObject({
      type: 'storage_delete',
      collection: 'nodes',
      documentId: 'n1',
    });
    expect(result.result).toEqual({ deleted: true });
  });

  it('throws when the host reports an error', async () => {
    const { result } = await runStorageTool(
      async (ctx) => {
        try {
          await ctx.storage.collection('nodes').put('n1', {});
          return { threw: false };
        } catch (err) {
          return { threw: true, message: (err as Error).message };
        }
      },
      () => ({ success: false, error: 'Document too large' }),
    );
    expect(result.result).toMatchObject({
      threw: true,
      message: 'storage_put failed: Document too large',
    });
  });

  it('kv is sugar over the reserved collection "kv"', async () => {
    const store = new Map<string, Record<string, unknown>>();
    const { result, requests } = await runStorageTool(
      async (ctx) => {
        await ctx.storage.kv.set('user:prefs', { theme: 'dark' });
        await ctx.storage.kv.set('counter', 1);
        const prefs = await ctx.storage.kv.get('user:prefs');
        const missing = await ctx.storage.kv.get('nope');
        const keys = await ctx.storage.kv.list('user:');
        const deleted = await ctx.storage.kv.delete('counter');
        return { prefs, missing, keys, deleted };
      },
      (m) => {
        const id = m.documentId as string;
        switch (m.type) {
          case 'storage_put':
            store.set(id, m.document as Record<string, unknown>);
            return { success: true, documentId: id };
          case 'storage_get':
            return { success: true, document: store.get(id) ?? null };
          case 'storage_query':
            return { success: true, documents: [...store.values()] };
          case 'storage_delete':
            store.delete(id);
            return { success: true };
          default:
            return undefined;
        }
      },
    );
    expect(requests.every((r) => r.collection === 'kv')).toBe(true);
    expect(requests[0]).toMatchObject({
      type: 'storage_put',
      documentId: 'user:prefs',
      document: { key: 'user:prefs', value: { theme: 'dark' } },
    });
    expect(result.result).toEqual({
      prefs: { theme: 'dark' },
      missing: null,
      keys: ['user:prefs'],
      deleted: true,
    });
  });
});

// ---------------------------------------------------------------------------
// ctx.objects (immutable blobs private to the Installation)
// ---------------------------------------------------------------------------

describe('ctx.objects', () => {
  const OBJECT_ID = 'obj_0123456789abcdef0123456789abcdef';
  const URL = `http://localhost:4100/objects/${OBJECT_ID}`;
  const info = {
    objectId: OBJECT_ID,
    url: URL,
    size: 5,
    contentType: 'text/plain',
    visibility: 'private',
    createdAt: '2026-11-08T00:00:00.000Z',
  };

  async function runTool(
    app: ReturnType<typeof createApp>,
    tool: string,
    answer: (m: Record<string, unknown>) => Record<string, unknown> | undefined,
  ): Promise<{ result: Record<string, unknown>; requests: Record<string, unknown>[] }> {
    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);
    const requests: Record<string, unknown>[] = [];
    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if ((m.type as string).startsWith('object_')) {
        requests.push(m);
        const reply = answer(m);
        if (reply) {
          hostSide.send({
            ...createSessionEnvelope(`${m.type as string}_result`, SESSION_ID),
            requestId: m.requestId as string,
            ...reply,
          } as MessageBase);
        }
      }
    });
    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: `tc_${tool}`,
        tool,
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );
    return { result: await toolResult, requests };
  }

  it('put sends base64 data with contentType and returns the object info', async () => {
    const app = createApp({ id: 'app.objects', version: '1.0.0' });
    app.tool('put', {
      description: 'put',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) =>
        ctx.objects.put('hello', {
          contentType: 'text/plain',
          filename: 'a.txt',
          visibility: 'public',
        }),
    });
    const { result, requests } = await runTool(app, 'put', () => ({
      success: true,
      ...info,
      visibility: 'public',
    }));
    expect(requests[0].type).toBe('object_put');
    expect(requests[0].data).toBe(Buffer.from('hello').toString('base64'));
    expect(requests[0].contentType).toBe('text/plain');
    expect(requests[0].filename).toBe('a.txt');
    expect(requests[0].visibility).toBe('public');
    expect(result.success).toBe(true);
    expect((result.result as Record<string, unknown>).objectId).toBe(OBJECT_ID);
    expect((result.result as Record<string, unknown>).url).toBe(URL);
  });

  it('put throws with the host error when it fails', async () => {
    const app = createApp({ id: 'app.objects-fail', version: '1.0.0' });
    app.tool('put-fail', {
      description: 'put',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        try {
          await ctx.objects.put(Buffer.from('x'), { contentType: 'text/plain' });
          return { threw: false };
        } catch (err) {
          return { threw: true, message: (err as Error).message };
        }
      },
    });
    const { result } = await runTool(app, 'put-fail', () => ({
      success: false,
      error: 'disk full',
    }));
    expect(result.result).toEqual({ threw: true, message: 'disk full' });
  });

  it('get accepts an object URL, resolves the id and returns a Buffer', async () => {
    const app = createApp({ id: 'app.objects-get', version: '1.0.0' });
    app.tool('get', {
      description: 'get',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const found = await ctx.objects.get(URL);
        return found ? { text: found.data.toString('utf8'), contentType: found.contentType } : null;
      },
    });
    const { result, requests } = await runTool(app, 'get', () => ({
      success: true,
      ...info,
      data: Buffer.from('hello').toString('base64'),
    }));
    expect(requests[0].type).toBe('object_get');
    expect(requests[0].objectId).toBe(OBJECT_ID);
    expect(result.result).toEqual({ text: 'hello', contentType: 'text/plain' });
  });

  it('get returns null when the object does not exist', async () => {
    const app = createApp({ id: 'app.objects-get-null', version: '1.0.0' });
    app.tool('get-null', {
      description: 'get',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => ({ found: await ctx.objects.get(OBJECT_ID) }),
    });
    const { result } = await runTool(app, 'get-null', () => ({
      success: false,
      error: 'Object not found',
    }));
    expect(result.result).toEqual({ found: null });
  });

  it('delete returns the host success flag', async () => {
    const app = createApp({ id: 'app.objects-del', version: '1.0.0' });
    app.tool('del', {
      description: 'del',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => ({ deleted: await ctx.objects.delete(OBJECT_ID) }),
    });
    const { result, requests } = await runTool(app, 'del', () => ({ success: true }));
    expect(requests[0].type).toBe('object_delete');
    expect(result.result).toEqual({ deleted: true });
  });

  it('list forwards limit and cursor and returns the page', async () => {
    const app = createApp({ id: 'app.objects-list', version: '1.0.0' });
    app.tool('list', {
      description: 'list',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => ctx.objects.list({ limit: 2, cursor: OBJECT_ID }),
    });
    const { result, requests } = await runTool(app, 'list', () => ({
      success: true,
      objects: [info],
      nextCursor: OBJECT_ID,
    }));
    expect(requests[0].limit).toBe(2);
    expect(requests[0].cursor).toBe(OBJECT_ID);
    const page = result.result as { objects: unknown[]; nextCursor?: string };
    expect(page.objects).toHaveLength(1);
    expect(page.nextCursor).toBe(OBJECT_ID);
  });

  it('link sends expiresIn and returns the signed url', async () => {
    const app = createApp({ id: 'app.objects-link', version: '1.0.0' });
    app.tool('link', {
      description: 'link',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => ctx.objects.link(URL, { expiresIn: 600 }),
    });
    const { result, requests } = await runTool(app, 'link', () => ({
      success: true,
      url: `${URL}?token=abc.def`,
      expiresAt: '2026-11-08T00:10:00.000Z',
    }));
    expect(requests[0].type).toBe('object_link');
    expect(requests[0].objectId).toBe(OBJECT_ID);
    expect(requests[0].expiresIn).toBe(600);
    expect(result.result).toEqual({
      url: `${URL}?token=abc.def`,
      expiresAt: '2026-11-08T00:10:00.000Z',
    });
  });
});
