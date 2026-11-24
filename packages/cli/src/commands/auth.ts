/**
 * @agentapps/cli — auth command.
 *
 * The Station runs OAuth: it builds the authorize URL, receives the callback,
 * exchanges the code and keeps the tokens. The CLI starts the flow and waits.
 *
 * Two modes:
 *   1. Interactive (default): opens the browser and polls the Station until done.
 *   2. `--url-only`: prints the OAuth URL and exits, for headless or mobile sign-in.
 *
 * Subcommands:
 *   <alias> auth          — sign in (no-op if already signed in)
 *   <alias> auth logout   — remove the Installation's stored tokens
 *   <alias> auth reauth   — remove them and run a fresh OAuth flow
 */

import { requestRemoteAuth } from '../prompt.js';
import { isResult, StationUnreachableError, stationOf } from '../station-client.js';
import { findInstallation, unknownAlias } from '../station-session.js';
import { stationUnreachable } from '../station-url.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

/**
 * @spec SETUP-REQ-6
 * @spec SETUP-REQ-7
 * @spec STADMIN-REQ-6
 */
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
  const { options } = context;
  // Where is the Station? `cli.stationUrl`, and nothing else (SETUP-REQ-6).
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    const instance = await findInstallation(station, alias);
    if (!instance) return unknownAlias(alias);
    const auth = instance.auth ?? { kind: 'none' as const, authenticated: true };
    const secretsPath = `/api/installations/${encodeURIComponent(instance.installationId)}/secrets`;

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

    // ─── auth logout ────────────────────────────────────────────────────
    if (command.action === 'logout') {
      const { removed } = await station.api<{ removed: string[] }>('PUT', secretsPath, {
        clear: true,
      });
      return {
        success: true,
        message:
          removed.length > 0
            ? `Logged out ${alias} — stored tokens removed.`
            : `${alias} has no active session — nothing to remove.`,
        exitCode: 0,
      };
    }

    // ─── auth reauth ────────────────────────────────────────────────────
    // Clear the stored tokens before a fresh flow: /auth/status reports signed
    // in as soon as tokens exist, so stale ones would end the flow at once.
    if (command.action === 'reauth') {
      await station.api('PUT', secretsPath, { clear: true });
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

    // ─── Mode 1: --url-only ─────────────────────────────────────────────
    // The Station registers the state and answers the URL; nothing waits.
    if (options.urlOnly) {
      const startUrl = new URL('/auth/start', station.url);
      startUrl.searchParams.set('installationId', instance.installationId);

      let resp: Response;
      try {
        resp = await fetch(startUrl.toString(), { headers: { Accept: 'application/json' } });
      } catch {
        // SETUP-REQ-7
        return stationUnreachable(station.url);
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
          provider: auth.provider,
          stationBaseUrl: station.url,
        } as unknown as ResultValue,
        exitCode: 0,
      };
    }

    // ─── Mode 2: interactive (default) ──────────────────────────────────
    try {
      await requestRemoteAuth(station.url, instance.installationId, {
        openInBrowser: !options.manualCode,
        title: `Authenticate ${alias}`,
      });
    } catch (err) {
      // SETUP-REQ-7
      if (err instanceof StationUnreachableError) return stationUnreachable(station.url);
      return {
        success: false,
        exitCode: 2,
        error: { message: err instanceof Error ? err.message : String(err) },
      };
    }

    // The Station kept the tokens. Ask it again for what it knows about them.
    const updated = await findInstallation(station, alias);
    return {
      success: true,
      message: `Authenticated ${alias}`,
      data: {
        Provider: auth.provider,
        Expires: updated?.auth?.expiresAt ?? 'unknown',
      } as ResultValue,
      exitCode: 0,
    };
  } catch (err) {
    return station.failure(err);
  }
}
