/**
 * Tests for host-side request handling (Session.onAuthRequest, onSecretRequest, onUrlRequest).
 */

import { createInProcessTransportPair } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentAppHost } from '../src/index.js';

// ---------------------------------------------------------------------------
// Test app with new requests
// ---------------------------------------------------------------------------

function buildCallbackApp() {
  const app = createApp({ id: 'app.request-test', version: '2.0.0' });

  app.tool('get-auth', {
    description: 'Requests auth via request',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const result = await ctx.requestAuth({
        provider: 'google',
        scopes: ['profile'],
      });
      return {
        token: result.accessToken,
        hasRefresh: !!result.refreshToken,
      };
    },
  });

  app.tool('get-secret', {
    description: 'Requests secret via request',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const result = await ctx.requestSecret({
        name: 'API_KEY',
        description: 'Your API key',
      });
      return { secret: result.value };
    },
  });

  app.tool('open-url', {
    description: 'Opens URL via request',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      await ctx.openUrl({ url: 'https://example.com', title: 'Example' });
      return { opened: true };
    },
  });

  app.health(async () => ({ status: 'ready', message: 'Test app healthy' }));

  return app.toFactory();
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let appStation: AppStation;
let host: AgentAppHost;

beforeEach(() => {
  const runtime = new InProcessRuntime(buildCallbackApp());
  appStation = new AppStation({
    appId: 'app.request-test',
    appVersion: '2.0.0',
    runtime,
  });

  const [hostSide, ctrlSide] = createInProcessTransportPair();
  appStation.accept(ctrlSide);

  host = new AgentAppHost(hostSide, {
    host: { name: 'test-platform', version: '1.0.0' },
    capabilities: {
      multiUser: true,
      push: true,
      prompts: ['auth', 'secret', 'url'],
      storage: true,
      objects: true,
      volume: true,
      profile: true,
      intents: true,
    },
  });
});

afterEach(async () => {
  await host.shutdown();
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Session request handlers', () => {
  it('session receives auth request request', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u1' },
    });

    let receivedProvider: string | undefined;
    let receivedScopes: string[] | undefined;

    session.onAuthRequest(async (req) => {
      receivedProvider = req.provider;
      receivedScopes = req.scopes;
      return {
        accessToken: 'host_auth_token_123',
        refreshToken: 'host_refresh_456',
        expiresAt: new Date('2026-12-31T23:59:59.000Z'),
      };
    });

    const result = await session.callTool(
      'get-auth',
      {},
      { userId: 'u1', installationId: 'inst_1' },
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      token: 'host_auth_token_123',
      hasRefresh: true,
    });
    expect(receivedProvider).toBe('google');
    expect(receivedScopes).toEqual(['profile']);
  });

  it('session receives secret request request', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_2',
      tenant: { userId: 'u1' },
    });

    let receivedName: string | undefined;
    let receivedDescription: string | undefined;

    session.onSecretRequest(async (req) => {
      receivedName = req.name;
      receivedDescription = req.description;
      return { value: 'host_secret_789' };
    });

    const result = await session.callTool(
      'get-secret',
      {},
      { userId: 'u1', installationId: 'inst_2' },
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ secret: 'host_secret_789' });
    expect(receivedName).toBe('API_KEY');
    expect(receivedDescription).toBe('Your API key');
  });

  it('session receives url request request', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_3',
      tenant: { userId: 'u1' },
    });

    let receivedUrl: string | undefined;
    let receivedTitle: string | undefined;

    session.onUrlRequest(async (req) => {
      receivedUrl = req.url;
      receivedTitle = req.title;
    });

    const result = await session.callTool(
      'open-url',
      {},
      { userId: 'u1', installationId: 'inst_3' },
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ opened: true });
    expect(receivedUrl).toBe('https://example.com');
    expect(receivedTitle).toBe('Example');
  });

  it('host can send prompt_result back to instance', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_4',
      tenant: { userId: 'u1' },
    });

    session.onAuthRequest(async () => {
      return { accessToken: 'result_token' };
    });

    const result = await session.callTool(
      'get-auth',
      {},
      { userId: 'u1', installationId: 'inst_4' },
    );

    expect(result.success).toBe(true);
    expect((result.result as Record<string, unknown>).token).toBe('result_token');
  });

  it('request handler errors are propagated to instance', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_5',
      tenant: { userId: 'u1' },
    });

    session.onAuthRequest(async () => {
      throw new Error('OAuth provider not configured');
    });

    const result = await session.callTool(
      'get-auth',
      {},
      { userId: 'u1', installationId: 'inst_5' },
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('OAuth provider not configured');
  });

  it('request without handler returns error to instance', async () => {
    await host.initialize();
    const session = await host.openSession({
      installationId: 'inst_6',
      tenant: { userId: 'u1' },
    });

    // No handler registered — the request should fail
    const result = await session.callTool(
      'get-auth',
      {},
      { userId: 'u1', installationId: 'inst_6' },
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toBeTruthy();
  });
});
