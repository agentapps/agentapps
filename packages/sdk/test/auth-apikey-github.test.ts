/**
 * Tests for API key and GitHub App auth support in @agentapps/sdk.
 *
 * Covers manifest generation, runtime secret helpers, and validation constraints.
 */

import {
  createInProcessTransportPair,
  createSessionEnvelope,
  type MessageBase,
} from '@agentapps/protocol';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';

const SESSION_ID = 'sess_auth_1';

const baseConfig = {
  id: 'app.auth.test' as const,
  version: '1.0.0' as const,
  name: 'Auth Test',
  description: 'A test app for API key and GitHub App auth support.',
  author: { name: 'Teros Team', email: 'team@teros.ai' },
  category: 'samples' as const,
  runtime: { transport: 'stdio' as const, command: 'node', args: ['dist/app.js'] },
};

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
// Manifest generation — API key
// ---------------------------------------------------------------------------

describe('toManifest with api-key auth', () => {
  it('emits a minimal api-key auth section', () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'api-key' as const,
        systemSecrets: ['API_KEY'],
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();

    expect(manifest.auth).toEqual({
      type: 'api-key',
      systemSecrets: ['API_KEY'],
    });
  });

  it('emits api-key with headerName and headerPrefix', () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'api-key' as const,
        systemSecrets: ['X_API_KEY'],
        headerName: 'X-Api-Key',
        headerPrefix: '',
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    const auth = manifest.auth as Record<string, unknown>;

    expect(auth.type).toBe('api-key');
    expect(auth.headerName).toBe('X-Api-Key');
    expect(auth.headerPrefix).toBe('');
    expect(auth.systemSecrets).toEqual(['X_API_KEY']);
  });

  it('supports installationSecrets for api-key', () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'api-key' as const,
        installationSecrets: ['USER_API_KEY'],
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    expect(manifest.auth).toEqual({
      type: 'api-key',
      installationSecrets: ['USER_API_KEY'],
    });
  });
});

// ---------------------------------------------------------------------------
// Manifest generation — GitHub App
// ---------------------------------------------------------------------------

describe('toManifest with github-app auth', () => {
  it('emits a minimal github-app auth section', () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'github-app' as const,
        provider: 'github' as const,
        appSlug: 'agentapps',
        setupUrl: 'https://github.com/apps/agentapps/installations/new',
        systemSecrets: ['GITHUB_APP_ID', 'PRIVATE_KEY', 'WEBHOOK_SECRET'],
        installationSecrets: ['INSTALLATION_ID'],
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();

    expect(manifest.auth).toEqual({
      type: 'github-app',
      provider: 'github',
      appSlug: 'agentapps',
      setupUrl: 'https://github.com/apps/agentapps/installations/new',
      systemSecrets: ['GITHUB_APP_ID', 'PRIVATE_KEY', 'WEBHOOK_SECRET'],
      installationSecrets: ['INSTALLATION_ID'],
    });
  });

  it('emits github-app with permissions and events', () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'github-app' as const,
        provider: 'github' as const,
        appSlug: 'agentapps',
        setupUrl: 'https://github.com/apps/agentapps/installations/new',
        userOAuth: true,
        tokenUrl: 'https://github.com/login/oauth/access_token',
        permissions: {
          issues: 'write',
          contents: 'read',
          metadata: 'read',
        },
        events: ['issues', 'issue_comment', 'pull_request'],
        systemSecrets: ['GITHUB_APP_ID', 'PRIVATE_KEY', 'WEBHOOK_SECRET'],
        installationSecrets: ['INSTALLATION_ID'],
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    const auth = manifest.auth as Record<string, unknown>;

    expect(auth.type).toBe('github-app');
    expect(auth.userOAuth).toBe(true);
    expect(auth.tokenUrl).toBe('https://github.com/login/oauth/access_token');
    expect(auth.permissions).toEqual({
      issues: 'write',
      contents: 'read',
      metadata: 'read',
    });
    expect(auth.events).toEqual(['issues', 'issue_comment', 'pull_request']);
  });

  it('rejects github-app without appSlug', () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'github-app' as const,
        provider: 'github' as const,
        appSlug: '',
        setupUrl: 'https://github.com/apps/agentapps/installations/new',
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    expect(() => app.toManifest()).toThrow();
  });

  it('rejects github-app with invalid setupUrl', () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'github-app' as const,
        provider: 'github' as const,
        appSlug: 'agentapps',
        setupUrl: 'not-a-url',
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    expect(() => app.toManifest()).toThrow();
  });

  it('rejects github-app with userOAuth true but missing tokenUrl', () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'github-app' as const,
        provider: 'github' as const,
        appSlug: 'agentapps',
        setupUrl: 'https://github.com/apps/agentapps/installations/new',
        userOAuth: true,
        events: ['installation'],
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    expect(() => app.toManifest()).toThrow('tokenUrl is required when userOAuth is true');
  });

  it('rejects github-app with userOAuth true but missing events', () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'github-app' as const,
        provider: 'github' as const,
        appSlug: 'agentapps',
        setupUrl: 'https://github.com/apps/agentapps/installations/new',
        userOAuth: true,
        tokenUrl: 'https://github.com/login/oauth/access_token',
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    expect(() => app.toManifest()).toThrow(
      'at least one webhook event is required when userOAuth is true',
    );
  });
});

// ---------------------------------------------------------------------------
// Runtime helpers — context.systemSecret / context.installationSecret
// ---------------------------------------------------------------------------

describe('ToolContext secret helpers', () => {
  it('reads present system and installation secrets via helpers', async () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'api-key' as const,
        systemSecrets: ['API_KEY'],
        installationSecrets: ['USER_TOKEN'],
      },
    });

    app.tool('read-secrets', {
      description: 'Read secrets via helpers',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const [systemApiKey, userToken] = await Promise.all([
          ctx.systemSecret('API_KEY'),
          ctx.installationSecret('USER_TOKEN'),
        ]);
        return { systemApiKey, userToken };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'get_system_secrets') {
        hostSide.send({
          ...createSessionEnvelope('get_system_secrets_response', SESSION_ID),
          requestId: m.requestId as string,
          secrets: { API_KEY: 'sk_system_123' },
        } as MessageBase);
      }
      if (m.type === 'get_installation_secrets') {
        hostSide.send({
          ...createSessionEnvelope('get_installation_secrets_response', SESSION_ID),
          requestId: m.requestId as string,
          secrets: { USER_TOKEN: 'tok_user_456' },
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_read_secrets',
        tool: 'read-secrets',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({
      systemApiKey: 'sk_system_123',
      userToken: 'tok_user_456',
    });
  });

  it('returns undefined for missing secrets', async () => {
    const app = createApp({
      ...baseConfig,
      auth: {
        type: 'api-key' as const,
        systemSecrets: ['API_KEY'],
      },
    });

    app.tool('missing-secrets', {
      description: 'Read missing secrets',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        const [systemMissing, userMissing] = await Promise.all([
          ctx.systemSecret('MISSING'),
          ctx.installationSecret('MISSING'),
        ]);
        return { systemMissing, userMissing };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    hostSide.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'get_system_secrets') {
        hostSide.send({
          ...createSessionEnvelope('get_system_secrets_response', SESSION_ID),
          requestId: m.requestId as string,
          secrets: { API_KEY: 'sk_system_123' },
        } as MessageBase);
      }
      if (m.type === 'get_installation_secrets') {
        hostSide.send({
          ...createSessionEnvelope('get_installation_secrets_response', SESSION_ID),
          requestId: m.requestId as string,
          secrets: null,
        } as MessageBase);
      }
    });

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_missing_secrets',
        tool: 'missing-secrets',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({
      systemMissing: undefined,
      userMissing: undefined,
    });
  });

  it('exposes systemSecret and installationSecret helpers even without auth config', async () => {
    const app = createApp({
      ...baseConfig,
    });

    app.tool('helpers-present', {
      description: 'Check secret helpers are present',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        return {
          hasSystemSecret: typeof ctx.systemSecret === 'function',
          hasUserSecret: typeof ctx.installationSecret === 'function',
        };
      },
    });

    const [hostSide, appSide] = createInProcessTransportPair();
    app.toFactory()(appSide);

    const toolResult = waitFor(hostSide, (m) => m.type === 'tool_result');
    hostSide.send(
      sessionMsg('tool_call', {
        id: 'tc_helpers_present',
        tool: 'helpers-present',
        arguments: {},
        context: { userId: 'u1', installationId: 'inst_1' },
      }),
    );

    const msg = await toolResult;
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({
      hasSystemSecret: true,
      hasUserSecret: true,
    });
  });
});
