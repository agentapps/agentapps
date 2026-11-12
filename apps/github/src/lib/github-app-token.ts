/**
 * GitHub App installation token resolver.
 *
 * Signs a short-lived JWT and exchanges it for a 1h installation access token
 * via `POST /app/installations/{id}/access_tokens`. Results cached in-memory.
 */

import type { ToolContext } from '@agentapps/sdk';
import { createAppAuth } from '@octokit/auth-app';

const SAFETY_BUFFER_MS = 60_000;

interface CachedToken {
  token: string;
  expiresAt: number;
  permissions: Record<string, string>;
}

const cache = new Map<string, CachedToken>();

export class GitHubAppNotInstalledError extends Error {
  readonly code = 'APP_NOT_INSTALLED' as const;
  readonly installUrl: string;

  constructor(installUrl: string) {
    super(`GitHub App is not installed on this account. Install it at ${installUrl} to continue.`);
    this.name = 'GitHubAppNotInstalledError';
    this.installUrl = installUrl;
  }
}

interface AppCredentials {
  appId: string;
  privateKey: string;
  clientId?: string;
  appSlug: string;
}

function readAppCredentials(systemSecrets: Record<string, string>): AppCredentials {
  const appId = systemSecrets.GITHUB_APP_ID;
  const privateKey = systemSecrets.GITHUB_APP_PRIVATE_KEY;
  const clientId = systemSecrets.GITHUB_APP_CLIENT_ID;
  const appSlug = systemSecrets.GITHUB_APP_SLUG ?? 'agentapps';
  if (!appId || !privateKey) {
    throw new Error(
      'GitHub App credentials missing: GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required in system secrets.',
    );
  }
  return { appId, privateKey, clientId, appSlug };
}

function cacheKey(installationId: string, permissions?: Record<string, string>): string {
  if (!permissions || Object.keys(permissions).length === 0) {
    return `${installationId}:default`;
  }
  const sorted = Object.keys(permissions)
    .sort()
    .map((k) => `${k}=${permissions[k]}`)
    .join(',');
  return `${installationId}:${sorted}`;
}

/**
 * Get a fresh installation access token, using cache when possible.
 */
export async function resolveInstallationToken(
  ctx: ToolContext,
  permissions?: Record<string, string>,
): Promise<string> {
  const sys = await ctx.secrets.getSystem();
  const user = await ctx.secrets.getInstallation();

  const installationId = user?.INSTALLATION_ID;
  if (!installationId) {
    const slug = sys?.GITHUB_APP_SLUG ?? 'agentapps';
    throw new GitHubAppNotInstalledError(`https://github.com/apps/${slug}/installations/new`);
  }

  const key = cacheKey(installationId, permissions);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt - SAFETY_BUFFER_MS > now) {
    return cached.token;
  }

  if (process.env.MCA_GITHUB_TEST_TOKEN) {
    cache.set(key, {
      token: process.env.MCA_GITHUB_TEST_TOKEN,
      expiresAt: now + 60 * 60 * 1000,
      permissions: {},
    });
    return process.env.MCA_GITHUB_TEST_TOKEN;
  }

  if (!sys) {
    throw new Error('GitHub App credentials missing: system secrets are not configured.');
  }
  const creds = readAppCredentials(sys);
  const auth = createAppAuth({
    appId: creds.appId,
    privateKey: creds.privateKey,
    clientId: creds.clientId,
  });

  const result = (await auth({
    type: 'installation',
    installationId,
    permissions,
  })) as { token: string; expiresAt: string; permissions?: Record<string, string> };

  const expiresAtMs = Date.parse(result.expiresAt);
  cache.set(key, {
    token: result.token,
    expiresAt: Number.isFinite(expiresAtMs) ? expiresAtMs : now + 60 * 60 * 1000,
    permissions: result.permissions ?? {},
  });

  return result.token;
}

/**
 * Read the install URL for this app.
 */
export async function getInstallUrl(ctx: ToolContext): Promise<string> {
  const sys = await ctx.secrets.getSystem();
  const slug = sys?.GITHUB_APP_SLUG ?? 'agentapps';
  return `https://github.com/apps/${slug}/installations/new`;
}
