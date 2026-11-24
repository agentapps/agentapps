/**
 * @agentapps/cli — install command.
 */

import { sourceMetadata } from '../config.js';
import { readLine } from '../prompt.js';
import { isResult, StationError, stationOf } from '../station-client.js';
import { findInstallation } from '../station-session.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

// ---------------------------------------------------------------------------
// Permission descriptions for consent screen
// ---------------------------------------------------------------------------

/** Human-readable labels for each permission key. */
const PERMISSION_LABELS: Record<string, string> = {
  profile: 'User profile',
  network: 'Outbound network access',
  volume: 'Shared workspace volume',
  intents: 'Call tools of other apps',
  hooksContext: 'Hook: add context to the conversation',
  hooksVeto: 'Hook: block your messages',
  hooksTransform: 'Hook: rewrite your messages',
  hooksHistory: 'Hook: read previous turns',
  hooksConversation: 'Hook: read whole conversations',
  hooksWorkspaceWide: 'Hook: every conversation of the workspace',
};

/**
 * Permissions considered high risk (require extra scrutiny).
 * These are shown with a warning indicator.
 */
const HIGH_RISK_GRANTS = new Set([
  'hooksVeto',
  'hooksTransform',
  'hooksHistory',
  'hooksConversation',
  'hooksWorkspaceWide',
  'network',
  'volume',
  'intents',
]);

/**
 * Format the permissions object into human-readable lines for the consent screen.
 */
function formatPermissions(permissions: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(permissions)) {
    if (value === undefined || value === false) continue;

    const label = PERMISSION_LABELS[key] ?? key;
    const isHighRisk = HIGH_RISK_GRANTS.has(key);
    const prefix = isHighRisk ? '  [!] ' : '  - ';

    if (typeof value === 'string') {
      // e.g., profile: 'full'
      lines.push(`${prefix}${label}: ${value}`);
    } else if (typeof value === 'boolean' && value) {
      lines.push(`${prefix}${label}`);
    } else if (typeof value === 'object' && value !== null) {
      // e.g., network: { egress: [...] }
      const detail = JSON.stringify(value);
      lines.push(`${prefix}${label}: ${detail}`);
    }
  }
  // Highest risk first (POLICY-REQ-9).
  return [...lines.filter((l) => l.includes('[!]')), ...lines.filter((l) => !l.includes('[!]'))];
}

// ---------------------------------------------------------------------------
// Install handler
// ---------------------------------------------------------------------------

/** The Permissions of a Manifest that an Installation has not been approved for yet. */
function unapproved(
  requested: Record<string, unknown> | undefined,
  approved: Record<string, unknown> | undefined,
): string[] {
  return Object.keys(requested ?? {}).filter(
    (key) => JSON.stringify(requested?.[key]) !== JSON.stringify(approved?.[key]),
  );
}

/**
 * Install an App the Station has available. Installing never makes an App
 * available: the Station Operator does, with `station apps add`.
 *
 * @spec POLICY-REQ-9
 * @spec STADMIN-REQ-6
 * @spec STADMIN-REQ-9
 */
export async function handleInstall(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'install') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected install command' },
    };
  }

  const { appId, alias } = command;
  const { ctx, options } = context;
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    // The Manifest, to show what the App requests: from the Station when it
    // has the App loaded, otherwise what the workspace or the catalog knows.
    let manifest: Record<string, unknown> | undefined;
    try {
      manifest = await station.api('GET', `/apps/${encodeURIComponent(appId)}/manifest`);
    } catch (err) {
      if (!(err instanceof StationError)) throw err;
      const listed = ctx.config.apps[appId];
      manifest = listed ? sourceMetadata(ctx.configPath, listed.source) : undefined;
    }

    // POLICY-REQ-9: the Approver approves the requested Permissions before the
    // installation exists. `-y` answers yes up front; otherwise the CLI asks and
    // refuses to install without an answer.
    const permissions = manifest?.permissions as Record<string, unknown> | undefined;
    const existing = await findInstallation(station, alias);
    const reapproval = existing?.appId === appId;
    const toApprove = reapproval
      ? unapproved(permissions, existing?.permissions)
      : Object.keys(permissions ?? {});

    if (reapproval && toApprove.length === 0) {
      return { success: true, message: `${alias} (${appId}) is already installed`, exitCode: 0 };
    }

    const permissionLines = permissions
      ? formatPermissions(Object.fromEntries(toApprove.map((k) => [k, permissions[k]])))
      : [];
    if (permissionLines.length > 0 && !options.yes) {
      console.error(
        `\n  ${appId} ${reapproval ? 'now also requests' : 'requests'} the following permissions:\n`,
      );
      for (const line of permissionLines) console.error(line);
      if (permissionLines.some((l) => l.includes('[!]'))) {
        console.error('\n  [!] = elevated privilege (review carefully)');
      }
      process.stderr.write('\n  Approve and install? [y/N] ');
      const answer = await readLine(process.stdin);
      if (!/^y(es)?$/i.test(answer)) {
        return {
          success: false,
          exitCode: answer === '' ? 2 : 1,
          error: {
            message:
              answer === ''
                ? `Installing ${appId} needs the Approver to approve its permissions, and no answer was given.`
                : 'Not installed: the permissions were not approved.',
            suggestion: 'Run it in a terminal and answer y, or pass -y to approve.',
          },
        };
      }
    }

    if (reapproval && existing) {
      await station.api(
        'PATCH',
        `/api/installations/${encodeURIComponent(existing.installationId)}`,
        {
          permissions: permissions ?? {},
        },
      );
      return {
        success: true,
        message: `Approved the new permissions of ${alias} (${appId})`,
        exitCode: 0,
      };
    }

    let installed: Awaited<ReturnType<typeof findInstallation>>;
    try {
      // The approved Permissions become the Installation's Effective Permissions
      // (VOL-REQ-2, POLICY-REQ-9).
      installed = await station.api('POST', '/api/installations', {
        appId,
        alias,
        ...(permissions ? { permissions } : {}),
      });
    } catch (err) {
      if (!(err instanceof StationError)) throw err;
      if (err.code === 'APP_NOT_AVAILABLE') {
        // STADMIN-REQ-9: installing never adds an App; whoever operates the
        // Station is told the command that does.
        return {
          success: false,
          exitCode: 2,
          error: {
            message: `App not found: ${appId}. It is not available on this Station; the Station Operator has to add it.`,
            suggestion:
              err.body.operator === true
                ? `Add it with:\n  agentapps station apps add ${appId}\nthen install it again.`
                : 'Run "apps" to see available apps.',
          },
        };
      }
      if (err.code === 'APP_DOWNLOAD_FAILED') {
        return { success: false, exitCode: 1, error: { message: err.message } };
      }
      if (err.code === 'ALIAS_TAKEN') {
        return {
          success: false,
          exitCode: 2,
          error: {
            message: err.message,
            suggestion: `Use a different alias, or run: uninstall ${alias}`,
          },
        };
      }
      throw err;
    }

    const auth = installed?.auth;
    const hints: string[] = [];
    if (auth && auth.kind !== 'none' && auth.kind !== 'api-key' && !auth.authenticated) {
      hints.push(`Authentication required. Run:\n  ${alias} auth`);
    }
    const missingSecrets = auth?.missingSecrets ?? [];
    if (missingSecrets.length > 0) {
      hints.push(
        `Missing system secrets: ${missingSecrets.join(', ')}. Run: agentapps config ${appId}`,
      );
    }

    return {
      success: true,
      message: `Installed ${alias} (${appId})`,
      data: hints.length > 0 ? { hint: hints.join('\n') } : undefined,
      exitCode: 0,
    };
  } catch (err) {
    return station.failure(err);
  }
}
