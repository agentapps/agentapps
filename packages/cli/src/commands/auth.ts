/**
 * @agentapps/cli — auth command.
 *
 * The CLI always delegates OAuth to the station server. The station registers
 * the state, handles the request, exchanges the code for tokens, and persists
 * them. The CLI just initiates the flow and polls for completion.
 *
 * Supports two modes:
 *   1. Full interactive flow (default): opens browser → station request → polls until done.
 *   2. `--url-only`: prints the OAuth URL and exits immediately, for headless/mobile auth.
 *
 * Subcommands:
 *   <alias> auth          — authenticate (no-op if already authenticated)
 *   <alias> auth logout   — remove the stored tokens for the instance
 *   <alias> auth reauth   — remove stored tokens and run a fresh OAuth flow
 */

import { getAuthInfo } from '../auth-helper.js';
import { deriveStationBaseUrl, InstallationSecretsStore, requestRemoteAuth } from '../host.js';
import { loadAppSecrets } from '../secrets-store.js';
import { getInstallation } from '../state.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

export async function handleAuth(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'auth') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected auth command' },
    };
  }

  const { alias } = command;
  const { ctx, options } = context;
  const instance = getInstallation(ctx.configPath, alias);

  if (!instance) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Unknown alias: ${alias}`,
        suggestion: `Run "installations" to see installed apps, or "install <app-id> ${alias}" to create it.`,
      },
    };
  }

  const entry = ctx.config.apps[instance.appId];
  if (!entry) {
    return {
      success: false,
      exitCode: 2,
      error: { message: `App configuration missing for ${instance.appId}` },
    };
  }

  const auth = await getAuthInfo(instance.installationId, instance.appId, ctx);

  if (auth.kind === 'none') {
    return {
      success: true,
      message: `${alias} does not require authentication.`,
      exitCode: 0,
    };
  }

  if (auth.kind === 'api-key') {
    if (command.action) {
      return {
        success: false,
        exitCode: 2,
        error: {
          message: `${instance.appId} uses an API key — there is no OAuth session to ${command.action === 'logout' ? 'log out' : 're-authenticate'}.`,
          suggestion: `Update the key with:\n  config ${instance.appId} <NAME>:"<value>"`,
        },
      };
    }
    if (auth.authenticated) {
      return {
        success: true,
        message: `${alias} is already configured (API key set).`,
        exitCode: 0,
      };
    }
    const missingSystem = auth.missingSecrets ?? [];
    const missingUser = auth.missingUserSecrets ?? [];
    const names = [...missingSystem, ...missingUser];
    // System secrets are configured per app id; installation secrets per instance alias.
    const lines = [
      ...missingSystem.map((n) => `  config ${instance.appId} ${n}:"<value>"`),
      ...missingUser.map((n) => `  config ${alias} ${n}:"<value>"`),
    ];
    if (lines.length === 0) lines.push(`  config ${instance.appId} APIKEY:"<value>"`);
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `${instance.appId} uses an API key, not an OAuth login. Missing: ${names.length ? names.join(', ') : 'APIKEY'}`,
        suggestion: `Set it with:\n${lines.join('\n')}`,
      },
    };
  }

  // ─── auth logout ──────────────────────────────────────────────────────
  if (command.action === 'logout') {
    const store = new InstallationSecretsStore(ctx.configPath, instance.installationId);
    const removed = store.clear();
    return {
      success: true,
      message: removed
        ? `Logged out ${alias} — stored tokens removed.`
        : `${alias} has no active session — nothing to remove.`,
      exitCode: 0,
    };
  }

  // ─── auth reauth ──────────────────────────────────────────────────────
  // Clear stored tokens before starting a fresh flow. This matters for the
  // station poll: /auth/status reports authenticated as soon as tokens exist,
  // so stale tokens would complete the flow instantly without a new consent.
  if (command.action === 'reauth') {
    new InstallationSecretsStore(ctx.configPath, instance.installationId).clear();
  } else if (auth.authenticated) {
    return {
      success: true,
      message: `${alias} is already authenticated.`,
      data: {
        Provider: auth.provider,
        Scopes: auth.scopes?.join(', '),
        Expires: auth.expiresAt,
      } as ResultValue,
      exitCode: 0,
    };
  }

  if (!auth.provider) {
    return {
      success: false,
      exitCode: 2,
      error: { message: `App ${instance.appId} does not declare an auth provider` },
    };
  }

  // Where is the station? Prefer the workspace-level `station.publicUrl` from
  // agentapps.json — a single value drives OAuth for every app, and it matches
  // the URL the station itself uses to build the shared `/auth/callback`. Fall
  // back to the app's REDIRECT_URI secret (which also encodes the station host)
  // for setups that predate the station config. Note the redirect_uri sent to
  // the provider is always built station-side from its own publicUrl, so apps
  // do not need a per-app REDIRECT_URI just to authenticate.
  const configuredStation = ctx.config.station?.publicUrl?.replace(/\/+$/, '');
  const systemSecrets = loadAppSecrets(ctx.configPath, instance.appId);
  const redirectUriSecret = systemSecrets.REDIRECT_URI;
  const stationBaseUrl = configuredStation
    ? configuredStation
    : redirectUriSecret
      ? deriveStationBaseUrl(redirectUriSecret)
      : undefined;
  if (!stationBaseUrl) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Cannot determine the station URL for ${instance.appId}`,
        suggestion:
          `Set the station URL once in agentapps.json:\n` +
          `  "station": { "publicUrl": "https://your-station.example.com" }\n` +
          `or set a per-app redirect URI:\n` +
          `  config ${instance.appId} REDIRECT_URI:"https://your-station.example.com/auth/callback"`,
      },
    };
  }

  // ─── Mode 1: --url-only ───────────────────────────────────────────────
  // Get the OAuth URL from the station (state registered server-side) and
  // return it without waiting for completion.
  if (options.urlOnly) {
    const startUrl = new URL('/auth/start', stationBaseUrl);
    startUrl.searchParams.set('installationId', instance.installationId);

    let resp: Response;
    try {
      resp = await fetch(startUrl.toString(), {
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      return {
        success: false,
        exitCode: 2,
        error: {
          message: `Cannot reach the station at ${stationBaseUrl}: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => 'unknown error');
      return {
        success: false,
        exitCode: 2,
        error: { message: `Station /auth/start failed (${resp.status}): ${body}` },
      };
    }

    const { url, state } = (await resp.json()) as { url: string; state: string };
    return {
      success: true,
      message: url,
      data: {
        url,
        state,
        redirectUri: redirectUriSecret,
        provider: auth.provider,
        stationBaseUrl,
      } as unknown as ResultValue,
      exitCode: 0,
    };
  }

  // ─── Mode 2: Full interactive flow (default) ─────────────────────────
  // Delegate to the station: it generates the state, handles the request,
  // exchanges the code for tokens, and persists them. The CLI polls until done.
  try {
    await requestRemoteAuth(stationBaseUrl, instance.installationId, {
      openInBrowser: !options.manualCode,
      title: `Authenticate ${alias}`,
    });
  } catch (err) {
    return {
      success: false,
      exitCode: 2,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }

  // Tokens were persisted by the station. Re-check to confirm and get metadata.
  const updatedAuth = await getAuthInfo(instance.installationId, instance.appId, ctx);

  return {
    success: true,
    message: `Authenticated ${alias}`,
    data: {
      Provider: auth.provider,
      Expires: updatedAuth.expiresAt ?? 'unknown',
    } as ResultValue,
    exitCode: 0,
  };
}
