/**
 * @agentapps/cli — install command.
 */

import { requiresAuth } from '../auth-helper.js';
import { resolveSourcePath } from '../config.js';
import { readLine } from '../host.js';
import { resolveApp } from '../resolve.js';
import { loadAppSecrets } from '../secrets-store.js';
import {
  addInstallation,
  getInstallation,
  setInstallationPermissions,
  unapprovedPermissions,
} from '../state.js';
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

/** @spec POLICY-REQ-9 */
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
  const entry = ctx.config.apps[appId];

  if (!entry) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `App not found: ${appId}`,
        suggestion: 'Run "apps" to see available apps.',
      },
    };
  }

  // Resolve the app to inspect its manifest.
  let app: { manifest?: Record<string, unknown> };
  try {
    const source = resolveSourcePath(ctx.configPath, entry.source);
    app = await resolveApp(appId, source);
  } catch {
    app = {};
  }

  // POLICY-REQ-9: the Approver approves the requested Permissions before the
  // installation exists. `-y` answers yes up front; otherwise the CLI asks and
  // refuses to install without an answer.
  const permissions = app.manifest?.permissions as Record<string, unknown> | undefined;
  const existing = getInstallation(ctx.configPath, alias);
  const reapproval = existing?.appId === appId;
  const toApprove = reapproval
    ? unapprovedPermissions(permissions, existing?.permissions)
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

  if (reapproval) {
    setInstallationPermissions(ctx.configPath, alias, permissions ?? {});
    return {
      success: true,
      message: `Approved the new permissions of ${alias} (${appId})`,
      exitCode: 0,
    };
  }

  try {
    // The approved Permissions become the Installation's Effective Permissions
    // (VOL-REQ-2, POLICY-REQ-9).
    addInstallation(ctx.configPath, alias, appId, permissions);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      exitCode: 2,
      error: {
        message,
        suggestion: `Use a different alias, or run: uninstall ${alias}`,
      },
    };
  }

  let authRequired = false;
  let missingSecrets: string[] = [];
  try {
    authRequired = requiresAuth(app);

    const auth = app.manifest?.auth as Record<string, unknown> | undefined;
    const systemSecrets = (auth?.systemSecrets ?? []) as string[];
    if (systemSecrets.length > 0) {
      const stored = loadAppSecrets(ctx.configPath, appId);
      missingSecrets = systemSecrets.filter((k) => !(k in stored));
    }
  } catch {
    authRequired = false;
  }

  const hints: string[] = [];
  if (authRequired) {
    hints.push(`Authentication required. Run:\n  ${alias} auth`);
  }
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
}
