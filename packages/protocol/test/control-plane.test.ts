import { describe, expect, it } from 'vitest';
import {
  ControllerHealthStatusResponseSchema,
  ControlPlaneRequestSchema,
  createEnvelope,
  generateMessageId,
  InitializedResponseSchema,
  InitializeRequestSchema,
  isRetryableError,
  PROTOCOL_VERSION,
} from '../src/index.js';

describe('envelope', () => {
  it('creates a valid control-plane envelope (no sessionId)', () => {
    const env = createEnvelope('initialize');
    expect(env.version).toBe(PROTOCOL_VERSION);
    expect(env.sessionId).toBeUndefined();
    expect(env.id).toBeTruthy();
  });

  it('creates a session-plane envelope when sessionId is given', () => {
    const env = createEnvelope('tool_call', 'sess_1');
    expect(env.sessionId).toBe('sess_1');
  });

  it('generates unique message ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateMessageId()));
    expect(ids.size).toBe(1000);
  });
});

describe('control plane schemas', () => {
  it('parses a valid initialize request', () => {
    const msg = {
      ...createEnvelope('initialize'),
      supportedVersions: ['2.0'],
      host: { name: 'agentapps', version: '1.0.0' },
      capabilities: { directConnection: false },
    };
    const parsed = ControlPlaneRequestSchema.parse(msg);
    expect(parsed.type).toBe('initialize');
  });

  it('rejects an unknown protocol version in the envelope', () => {
    const msg = {
      id: 'x',
      type: 'session_open',
      timestamp: new Date().toISOString(),
      version: '1.0',
      installationId: 'inst_1',
      tenant: { userId: 'u1' },
    };
    expect(ControlPlaneRequestSchema.safeParse(msg).success).toBe(false);
  });

  it('parses session_open with optional workspace tenant', () => {
    const msg = {
      ...createEnvelope('session_open'),
      installationId: 'inst_1',
      tenant: { userId: 'u1', workspaceId: 'w1' },
    };
    const parsed = ControlPlaneRequestSchema.parse(msg);
    if (parsed.type !== 'session_open') throw new Error('wrong variant');
    expect(parsed.tenant.workspaceId).toBe('w1');
  });

  it('requires reserved capability flags in initialized', () => {
    const base = {
      ...createEnvelope('initialized'),
      negotiatedVersion: '2.0',
      app: { id: 'app.gmail', version: '1.0.0' },
      station: { version: '0.1.0' },
      limits: { openTimeoutMs: 60_000, maxInflightPerSession: 32 },
    };
    const ok = InitializedResponseSchema.safeParse({
      ...base,
      capabilities: {
        directConnection: false,
        asyncOpen: false,
        push: true,
        extensions: [],
      },
    });
    expect(ok.success).toBe(true);

    const missingReserved = InitializedResponseSchema.safeParse({
      ...base,
      capabilities: { push: true, extensions: [] },
    });
    expect(missingReserved.success).toBe(false);
  });

  it('parses a bounded health response', () => {
    const msg = {
      ...createEnvelope('controller_health_status'),
      status: 'degraded',
      counts: { total: 120, ready: 118, degraded: 1, crashed: 1, starting: 0 },
      unhealthy: [
        {
          instanceId: 'i1',
          installationId: 'inst_9',
          status: 'crashed',
          uptime: 0,
          lastUsed: new Date().toISOString(),
        },
      ],
    };
    expect(ControllerHealthStatusResponseSchema.safeParse(msg).success).toBe(true);
  });
});

describe('errors', () => {
  it('classifies appStation errors for retry', () => {
    expect(isRetryableError('SPAWN_FAILED')).toBe(true);
    expect(isRetryableError('CONTROLLER_AT_CAPACITY')).toBe(true);
    expect(isRetryableError('SESSION_NOT_FOUND')).toBe(false);
    expect(isRetryableError('VERSION_UNSUPPORTED')).toBe(false);
  });
});

describe('Host Capabilities at initialize', () => {
  const base = {
    id: 'i1',
    type: 'initialize',
    timestamp: new Date().toISOString(),
    version: '2.0',
    supportedVersions: ['2.0'],
    host: { name: 'h', version: '1.0.0' },
  };

  it('[HOSTCAP-AC-1] parses the full object, drops unknown fields, rejects directConnection true', () => {
    const full = InitializeRequestSchema.parse({
      ...base,
      capabilities: {
        directConnection: false,
        ui: { components: ['text', 'tree'], appComponents: true, screens: true },
        multiUser: true,
        push: true,
        prompts: ['auth', 'secret', 'url'],
        storage: true,
        objects: true,
        volume: true,
        profile: true,
        intents: true,
        hooks: { points: ['pre-turn'], supports: { transform: true } },
      },
    });
    expect(full.capabilities.ui?.components).toEqual(['text', 'tree']);
    expect(full.capabilities.hooks?.supports.transform).toBe(true);

    const withUnknown = InitializeRequestSchema.parse({
      ...base,
      capabilities: { directConnection: false, telepathy: true },
    });
    expect(withUnknown.capabilities).toEqual({ directConnection: false });

    expect(
      InitializeRequestSchema.safeParse({ ...base, capabilities: { directConnection: true } })
        .success,
    ).toBe(false);
  });
});
