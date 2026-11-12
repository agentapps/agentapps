/**
 * Tests for OAuth2 support in @agentapps/sdk.
 *
 * Covers manifest generation for OAuth2 configs and runtime helpers
 * (context.auth / context.requestAuth) for handlers.
 */

import {
  createInProcessTransportPair,
  createSessionEnvelope,
  type MessageBase,
} from '@agentapps/protocol';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';

const SESSION_ID = 'sess_oauth2_1';

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

const baseConfig = {
  id: 'app.oauth.test' as const,
  version: '1.0.0' as const,
  name: 'OAuth Test',
  description: 'A test app for OAuth2 manifest and runtime helpers.',
  author: { name: 'Teros Team', email: 'team@teros.ai' },
  category: 'samples' as const,
  runtime: { transport: 'stdio' as const, command: 'node', args: ['dist/app.js'] },
};

// ---------------------------------------------------------------------------
// Manifest generation
// ---------------------------------------------------------------------------

describe('toManifest with OAuth2', () => {
  it('emits a minimal OAuth2 auth section', () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'oauth2' as const,
        provider: 'google',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['openid', 'email'],
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();

    expect(manifest.auth).toEqual({
      type: 'oauth2',
      provider: 'google',
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['openid', 'email'],
    });
  });

  it('emits OAuth2 with PKCE enabled', () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'oauth2' as const,
        provider: 'github',
        authorizeUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scopes: ['repo'],
        pkce: true,
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    const auth = manifest.auth as Record<string, unknown>;

    expect(auth.type).toBe('oauth2');
    expect(auth.provider).toBe('github');
    expect(auth.pkce).toBe(true);
  });

  it('emits OAuth2 with scopeSeparator and extraFields', () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'oauth2' as const,
        provider: 'figma',
        authorizeUrl: 'https://www.figma.com/oauth',
        tokenUrl: 'https://www.figma.com/api/oauth/token',
        scopes: ['files:read'],
        scopeSeparator: ',',
        extraFields: [
          {
            name: 'TEAM_ID',
            label: 'Team ID',
            type: 'text',
            required: true,
            placeholder: 'Enter your Figma team ID',
            hint: 'Found in the URL of your Figma team',
          },
        ],
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    const auth = manifest.auth as Record<string, unknown>;

    expect(auth.type).toBe('oauth2');
    expect(auth.scopeSeparator).toBe(',');
    expect(auth.extraFields).toEqual([
      {
        name: 'TEAM_ID',
        label: 'Team ID',
        type: 'text',
        required: true,
        placeholder: 'Enter your Figma team ID',
        hint: 'Found in the URL of your Figma team',
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

describe('ToolContext.auth', () => {
  it('exposes context.auth for OAuth2 apps', async () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'oauth2' as const,
        provider: 'google',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['email'],
      },
    });

    app.tool('auth-status', {
      description: 'Check auth status',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const status = await ctx.auth.getStatus();
        return { authenticated: status.authenticated };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'auth_status') {
        hostSide.send({
          ...createSessionEnvelope('auth_status_response', SESSION_ID),
          requestId: m.requestId as string,
          authenticated: true,
          provider: 'google',
          scopes: ['email'],
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_auth_status',
        tool: 'auth-status',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({ authenticated: true });
  });

  it('still exposes context.auth for apps without auth', async () => {
    const app = createApp({
      ...baseConfig,
    });

    app.tool('auth-present', {
      description: 'Check that auth helper is present',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        return {
          hasAuth: !!ctx.auth,
          hasGetStatus: typeof ctx.auth.getStatus === 'function',
        };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_auth_present',
        tool: 'auth-present',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({ hasAuth: true, hasGetStatus: true });
  });
});

describe('ToolContext.requestAuth', () => {
  it('initiates the OAuth callback and returns tokens on success', async () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'oauth2' as const,
        provider: 'google',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['email'],
      },
    });

    app.tool('request-auth', {
      description: 'Request OAuth authorization',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const result = await ctx.requestAuth({ provider: 'google', scopes: ['email'] });
        return {
          token: result.accessToken,
          hasRefresh: !!result.refreshToken,
          expires: result.expiresAt?.toISOString(),
        };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'prompt' && m.promptType === 'auth') {
        expect(m.provider).toBe('google');
        expect(m.scopes).toEqual(['email']);
        hostSide.send({
          ...createSessionEnvelope('prompt_result', SESSION_ID),
          promptId: m.promptId as string,
          success: true,
          accessToken: 'tok_oauth2_123',
          refreshToken: 'refresh_oauth2_456',
          expiresAt: '2026-12-31T23:59:59.000Z',
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_request_auth',
        tool: 'request-auth',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({
      token: 'tok_oauth2_123',
      hasRefresh: true,
      expires: '2026-12-31T23:59:59.000Z',
    });
  });

  it('throws when OAuth2 is explicitly disabled', async () => {
    const app = createApp({
      ...baseConfig,
      auth: { type: 'none' },
    });

    app.tool('request-auth-no-config', {
      description: 'Request auth without OAuth configured',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        await ctx.requestAuth({ provider: 'google' });
        return 'should not reach';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_request_auth_no_config',
        tool: 'request-auth-no-config',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(false);
    const error = msg.error as Record<string, unknown>;
    expect(error.message).toContain('OAuth2 authentication is not configured for this app');
  });

  it('allows requestAuth without auth config for ad-hoc OAuth callbacks', async () => {
    const app = createApp({
      ...baseConfig,
    });

    app.tool('request-auth-adhoc', {
      description: 'Request auth without declared OAuth config',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const result = await ctx.requestAuth({ provider: 'google' });
        return { token: result.accessToken };
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
          success: true,
          accessToken: 'tok_adhoc_123',
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_request_auth_adhoc',
        tool: 'request-auth-adhoc',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({ token: 'tok_adhoc_123' });
  });

  it('propagates pkce and scopeSeparator to the auth request', async () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'oauth2' as const,
        provider: 'figma',
        authorizeUrl: 'https://www.figma.com/oauth',
        tokenUrl: 'https://www.figma.com/api/oauth/token',
        scopes: ['files:read'],
        scopeSeparator: ',',
        pkce: true,
      },
    });

    let capturedCallback: Record<string, unknown> | undefined;

    app.tool('request-auth-figma', {
      description: 'Request Figma OAuth authorization',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const result = await ctx.requestAuth({ provider: 'figma', scopes: ['files:read'] });
        return { token: result.accessToken };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'prompt' && m.promptType === 'auth') {
        capturedCallback = m;
        hostSide.send({
          ...createSessionEnvelope('prompt_result', SESSION_ID),
          promptId: m.promptId as string,
          success: true,
          accessToken: 'tok_figma_123',
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_request_auth_figma',
        tool: 'request-auth-figma',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(capturedCallback).toBeDefined();
    expect(capturedCallback?.provider).toBe('figma');
    expect(capturedCallback?.scopes).toEqual(['files:read']);
    expect(capturedCallback?.pkce).toBe(true);
    expect(capturedCallback?.scopeSeparator).toBe(',');
  });

  it('throws on provider mismatch', async () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'oauth2' as const,
        provider: 'google',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['email'],
      },
    });

    app.tool('request-auth-mismatch', {
      description: 'Request auth for wrong provider',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        await ctx.requestAuth({ provider: 'microsoft' });
        return 'should not reach';
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_request_auth_mismatch',
        tool: 'request-auth-mismatch',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(false);
    const error = msg.error as Record<string, unknown>;
    expect(error.message).toContain('OAuth provider mismatch');
  });

  it('throws on auth failure response', async () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'oauth2' as const,
        provider: 'google',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['email'],
      },
    });

    app.tool('request-auth-fail', {
      description: 'Request auth and fail',
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
        id: 'tc_request_auth_fail',
        tool: 'request-auth-fail',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(false);
    const error = msg.error as Record<string, unknown>;
    expect(error.message).toContain('User denied authorization');
  });
});
