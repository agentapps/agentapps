/**
 * Tests for @agentapps/sdk health check builder.
 *
 * Validates status aggregation, issue helpers, secret/auth checks, and
 * external API connectivity validation.
 */

import { describe, expect, it, vi } from 'vitest';
import { HealthCheckBuilder } from '../src/health.js';
import type { AuthAccess, HealthContext, SecretsAccess } from '../src/types.js';

function fakeSecrets(
  system: Record<string, string> | null = null,
  user: Record<string, string> | null = null,
): SecretsAccess {
  return {
    getSystem: vi.fn().mockResolvedValue(system),
    getInstallation: vi.fn().mockResolvedValue(user),
    updateInstallation: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeAuth(authenticated: boolean, provider?: string): AuthAccess {
  return {
    getUrl: vi.fn().mockResolvedValue({ url: 'https://example.com/auth', state: 'state' }),
    getStatus: vi.fn().mockResolvedValue({ authenticated, provider }),
  };
}

describe('HealthCheckBuilder', () => {
  it('returns ready when no issues are added', () => {
    const builder = new HealthCheckBuilder();
    const result = builder.build('All good');
    expect(result.status).toBe('ready');
    expect(result.message).toBe('All good');
    expect(result.issues).toBeUndefined();
  });

  it('aggregates warning issues as degraded', () => {
    const builder = new HealthCheckBuilder();
    builder.addIssue({ code: 'slow', message: 'Slow response', severity: 'warning' });
    const result = builder.build();
    expect(result.status).toBe('degraded');
    expect(result.issues).toHaveLength(1);
  });

  it('aggregates error issues as not_ready', () => {
    const builder = new HealthCheckBuilder();
    builder.addIssue({ code: 'down', message: 'Service down', severity: 'error' });
    const result = builder.build();
    expect(result.status).toBe('not_ready');
    expect(result.issues).toHaveLength(1);
  });

  it('prioritizes error over warning', () => {
    const builder = new HealthCheckBuilder();
    builder.addIssue({ code: 'slow', message: 'Slow', severity: 'warning' });
    builder.addIssue({ code: 'down', message: 'Down', severity: 'error' });
    const result = builder.build();
    expect(result.status).toBe('not_ready');
  });

  it('adds issues conditionally with addIssueIf', () => {
    const builder = new HealthCheckBuilder();
    builder.addIssueIf(true, { code: 'a', message: 'A', severity: 'warning' });
    builder.addIssueIf(false, { code: 'b', message: 'B', severity: 'error' });
    const result = builder.build();
    expect(result.status).toBe('degraded');
    expect(result.issues?.map((i) => i.code)).toEqual(['a']);
  });

  it('adds an issue when a system secret is missing', async () => {
    const secrets = fakeSecrets({}, {});
    const builder = new HealthCheckBuilder(secrets);
    await builder.requireSystemSecret('API_KEY');
    const result = builder.build();
    expect(result.status).toBe('not_ready');
    expect(result.issues?.[0].code).toBe('missing_system_secret:API_KEY');
    expect(result.issues?.[0].action?.type).toBe('link');
  });

  it('does not add an issue when a system secret is present', async () => {
    const secrets = fakeSecrets({ API_KEY: 'secret' }, {});
    const builder = new HealthCheckBuilder(secrets);
    await builder.requireSystemSecret('API_KEY');
    const result = builder.build();
    expect(result.status).toBe('ready');
  });

  it('adds an issue when a user secret is missing with oauth provider', async () => {
    const secrets = fakeSecrets({}, {});
    const builder = new HealthCheckBuilder(secrets);
    await builder.requireUserSecret('ACCESS_TOKEN', 'google');
    const result = builder.build();
    expect(result.status).toBe('not_ready');
    expect(result.issues?.[0].code).toBe('missing_user_secret:ACCESS_TOKEN');
    expect(result.issues?.[0].action?.type).toBe('oauth');
  });

  it('adds a link action when a user secret is missing without provider', async () => {
    const secrets = fakeSecrets({}, {});
    const builder = new HealthCheckBuilder(secrets);
    await builder.requireUserSecret('ACCESS_TOKEN');
    const result = builder.build();
    expect(result.issues?.[0].action?.type).toBe('link');
  });

  it('adds an issue when auth is missing for the requested provider', async () => {
    const auth = fakeAuth(false);
    const builder = new HealthCheckBuilder(undefined, auth);
    await builder.requireAuth('google');
    const result = builder.build();
    expect(result.status).toBe('not_ready');
    expect(result.issues?.[0].code).toBe('auth_required:google');
    expect(result.issues?.[0].action?.type).toBe('oauth');
  });

  it('adds an issue when auth provider does not match', async () => {
    const auth = fakeAuth(true, 'github');
    const builder = new HealthCheckBuilder(undefined, auth);
    await builder.requireAuth('google');
    const result = builder.build();
    expect(result.status).toBe('not_ready');
  });

  it('does not add an auth issue when provider matches', async () => {
    const auth = fakeAuth(true, 'google');
    const builder = new HealthCheckBuilder(undefined, auth);
    await builder.requireAuth('google');
    const result = builder.build();
    expect(result.status).toBe('ready');
  });

  it('validates external API access successfully', async () => {
    const builder = new HealthCheckBuilder();
    await builder.requireApiAccess('https://api.example.com/health', async () => true);
    const result = builder.build();
    expect(result.status).toBe('ready');
  });

  it('adds an issue when external API check returns false', async () => {
    const builder = new HealthCheckBuilder();
    await builder.requireApiAccess('https://api.example.com/health', async () => false, {
      label: 'Example API',
    });
    const result = builder.build();
    expect(result.status).toBe('not_ready');
    expect(result.issues?.[0].code).toBe('api_unreachable:Example API');
  });

  it('adds an issue when external API check throws', async () => {
    const builder = new HealthCheckBuilder();
    await builder.requireApiAccess('https://api.example.com/health', async () => {
      throw new Error('connection refused');
    });
    const result = builder.build();
    expect(result.status).toBe('not_ready');
    expect(result.issues?.[0].code).toBe('api_error:https://api.example.com/health');
  });

  it('adds a timeout issue when the check exceeds the timeout', async () => {
    const builder = new HealthCheckBuilder();
    await builder.requireApiAccess(
      'https://api.example.com/health',
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return true;
      },
      { timeoutMs: 10, label: 'Slow API' },
    );
    const result = builder.build();
    expect(result.status).toBe('not_ready');
    expect(result.issues?.[0].code).toBe('api_timeout:Slow API');
  });

  it('supports a link action for API access failures', async () => {
    const builder = new HealthCheckBuilder();
    await builder.requireApiAccess('https://api.example.com/health', async () => false, {
      label: 'Example API',
      helpUrl: 'https://status.example.com',
    });
    const result = builder.build();
    expect(result.issues?.[0].action).toEqual({
      type: 'link',
      url: 'https://status.example.com',
      label: 'View API status',
    });
  });

  it('supports an oauth action for API access failures when provider is given', async () => {
    const builder = new HealthCheckBuilder();
    await builder.requireApiAccess('https://api.example.com/health', async () => false, {
      label: 'Example API',
      provider: 'google',
    });
    const result = builder.build();
    expect(result.issues?.[0].action).toEqual({
      type: 'oauth',
      url: '/auth/google',
      label: 'Reconnect google',
    });
  });

  it('can be used from a HealthContext', async () => {
    const ctx: HealthContext = {
      secrets: fakeSecrets({ API_KEY: 'x' }, {}),
      auth: fakeAuth(true, 'google'),
      log: vi.fn(),
    };
    const builder = new HealthCheckBuilder(ctx.secrets, ctx.auth);
    await builder.requireSystemSecret('API_KEY');
    await builder.requireAuth('google');
    const result = builder.build();
    expect(result.status).toBe('ready');
  });
});
