/**
 * @agentapps/cli — auth helper.
 *
 * Resolves an instance's auth status from the app manifest's auth declaration:
 * `oauth2` apps are checked for stored tokens via host callbacks, `api-key`
 * apps for their declared system secrets, and apps without auth are always
 * ready.
 */

import { resolveSourcePath } from './config.js';
import { createCliHostRequestHandlers, InstallationSecretsStore } from './host.js';
import { resolveApp } from './resolve.js';
import { loadAppSecrets } from './secrets-store.js';
import type { CliContext } from './types.js';

export type AuthKind = 'oauth2' | 'api-key' | 'none';

export interface AuthInfo {
  authenticated: boolean;
  kind: AuthKind;
  provider?: string;
  scopes?: string[];
  expiresAt?: string;
  authUrl?: string;
  /** Declared system secrets (api-key auth) that are not yet configured. */
  missingSecrets?: string[];
  /** Declared per-installation secrets (api-key auth) that are not yet configured. */
  missingUserSecrets?: string[];
}

export async function getAuthInfo(
  installationId: string,
  appId: string,
  ctx: CliContext,
): Promise<AuthInfo> {
  const entry = ctx.config.apps[appId];
  if (!entry) return { authenticated: false, kind: 'none' };

  const source = resolveSourcePath(ctx.configPath, entry.source);
  const app = await resolveApp(appId, source);
  const auth = app.manifest?.auth as Record<string, unknown> | false | undefined;

  if (!auth || auth.type === 'none') {
    return { authenticated: true, kind: 'none' };
  }

  if (auth.type === 'api-key') {
    const requiredSystem = Array.isArray(auth.systemSecrets)
      ? (auth.systemSecrets as string[])
      : [];
    const storedSystem = loadAppSecrets(ctx.configPath, appId);
    const missingSecrets = requiredSystem.filter((name) => !storedSystem[name]);

    // Apps may also declare per-installation secrets (e.g. a personal API key).
    const requiredUser = Array.isArray(auth.installationSecrets)
      ? (auth.installationSecrets as string[])
      : [];
    const storedUser = new InstallationSecretsStore(ctx.configPath, installationId).read();
    const missingUserSecrets = requiredUser.filter((name) => !storedUser[name]);

    return {
      authenticated: missingSecrets.length === 0 && missingUserSecrets.length === 0,
      kind: 'api-key',
      missingSecrets,
      missingUserSecrets,
    };
  }

  const requests = createCliHostRequestHandlers({
    app,
    appEntry: entry,
    configPath: ctx.configPath,
    installationId,
  });

  const status = await requests.onAuthStatus?.('sess', 'req');
  return {
    authenticated: status?.authenticated ?? false,
    kind: 'oauth2',
    provider: status?.provider,
    scopes: status?.scopes,
    expiresAt: status?.expiresAt,
    authUrl: status?.authUrl,
  };
}

/** Human-readable status label with a ✓/● glyph the renderer colorizes. */
export function authStatusLabel(info: AuthInfo): string {
  if (info.kind === 'none') return '✓ ready';
  if (info.authenticated) {
    return info.kind === 'api-key' ? '✓ api key set' : '✓ authenticated';
  }
  if (info.kind === 'api-key') {
    const missing = [...(info.missingSecrets ?? []), ...(info.missingUserSecrets ?? [])];
    const names = missing.length ? missing.join(', ') : 'API key';
    return `● needs api key: ${names}`;
  }
  return '● needs login';
}

export function requiresAuth(app: { manifest?: Record<string, unknown> }): boolean {
  const auth = app.manifest?.auth as Record<string, unknown> | undefined;
  return !!auth && typeof auth.provider === 'string';
}
