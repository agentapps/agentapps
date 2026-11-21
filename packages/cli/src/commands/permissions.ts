/**
 * @agentapps/cli — permissions command (per-tool).
 *
 * Usage:
 *   permissions <alias>                          — show every tool's effective permission
 *   permissions <alias> set <tool> <allow|ask|deny> — override one tool
 *   permissions <alias> remove <tool>            — clear a tool's override
 *
 * Each tool's effective permission is what the local admin's Policy decides
 * for it. An override is a per-tool Rule on that Policy, so it applies to the
 * CLI only: an API Key is another Principal with its own Policy, changed with
 * `policy set <principal> <app> <tool> <effect>`.
 */

import { ADMIN_PRINCIPAL_ID } from '@agentapps/protocol';
import { evaluatePolicy } from '@agentapps/station';
import { resolveSourcePath } from '../config.js';
import { color, GREEN, RED, YELLOW } from '../render/colors.js';
import { resolveApp } from '../resolve.js';
import { openAppSession } from '../session.js';
import {
  getInstallation,
  getPolicy,
  getToolOverridesForInstallation,
  removeToolPermission,
  setToolPermission,
} from '../state.js';
import { writeCachedTools } from '../tools-cache.js';
import type { AppConfigEntry, CliContext, HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

interface ToolInfo {
  name: string;
  annotations?: { sensitive?: boolean };
}

/** List an instance's tools, reusing the pooled REPL session when available. */
async function fetchTools(
  ctx: CliContext,
  context: HandlerContext,
  alias: string,
  installationId: string,
  appId: string,
  entry: AppConfigEntry,
): Promise<ToolInfo[]> {
  const pooled = context.sessions ? await context.sessions.acquire(alias, appId, ctx) : undefined;
  const ephemeral = pooled
    ? undefined
    : await (async () => {
        const source = resolveSourcePath(ctx.configPath, entry.source);
        const app = await resolveApp(appId, source);
        return openAppSession(app, ctx, installationId);
      })();
  const session = (pooled ?? ephemeral!).session;
  try {
    const tools = await session.listTools();
    writeCachedTools(ctx.configPath, appId, tools);
    return tools as ToolInfo[];
  } catch (err) {
    if (pooled) await context.sessions?.release(alias);
    throw err;
  } finally {
    if (ephemeral) {
      await session.close();
      await ephemeral.shutdown();
    }
  }
}

export async function handlePermissions(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'permissions') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected permissions command' },
    };
  }

  const { alias } = command;
  const { ctx } = context;

  const instance = getInstallation(ctx.configPath, alias);
  if (!instance) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Unknown instance: ${alias}`,
        suggestion: 'Run "installations" to see installed apps.',
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

  const tools = await fetchTools(
    ctx,
    context,
    alias,
    instance.installationId,
    instance.appId,
    entry,
  );
  const overrides = getToolOverridesForInstallation(ctx.configPath, instance.installationId);
  const policy = getPolicy(ctx.configPath, ADMIN_PRINCIPAL_ID);

  // Two columns: the tool and its effective permission. A permission that comes
  // from an explicit override is colorized (by effect) so it stands out from the
  // uncolored defaults. Match the renderer's color gating so --json / --no-color
  // / piped output stays plain.
  const noColor = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '';
  const useColor =
    (process.stdout.isTTY ?? false) &&
    !noColor &&
    !context.options.json &&
    !context.options.yaml &&
    !context.options.raw;
  const EFFECT_COLOR = { allow: GREEN, ask: YELLOW, deny: RED } as const;

  const rows = tools
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => {
      // What the admin's Policy gives a call without arguments; Rules with
      // argument conditions decide per call (POLICY-REQ-3).
      const override = overrides[t.name];
      const effective = evaluatePolicy(policy, {
        app: instance.appId,
        tool: t.name,
        args: {},
        annotations: t.annotations as Record<string, unknown> | undefined,
      }).effect;
      const permission =
        override !== undefined
          ? color(EFFECT_COLOR[override], effective, { enabled: useColor })
          : effective;
      return { Tool: t.name, Permission: permission };
    });

  const overrideCount = Object.keys(overrides).length;
  return {
    success: true,
    data: rows,
    message: `${tools.length} tool${tools.length === 1 ? '' : 's'} · ${overrideCount} override${overrideCount === 1 ? '' : 's'} for ${alias}`,
    exitCode: 0,
  };
}

export async function handlePermissionsSet(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'permissions-set') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected permissions-set command' },
    };
  }

  const { alias, tool, effect } = command;
  const { ctx } = context;

  const instance = getInstallation(ctx.configPath, alias);
  if (!instance) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Unknown instance: ${alias}`,
        suggestion: 'Run "installations" to see installed apps.',
      },
    };
  }

  setToolPermission(ctx.configPath, instance.installationId, tool, effect);
  return {
    success: true,
    message: `Override set: ${tool} → ${effect} for ${alias}`,
    exitCode: 0,
  };
}

export async function handlePermissionsRemove(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'permissions-remove') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected permissions-remove command' },
    };
  }

  const { alias, tool } = command;
  const { ctx } = context;

  const instance = getInstallation(ctx.configPath, alias);
  if (!instance) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Unknown instance: ${alias}`,
        suggestion: 'Run "installations" to see installed apps.',
      },
    };
  }

  const removed = removeToolPermission(ctx.configPath, instance.installationId, tool);
  if (!removed) {
    return {
      success: false,
      exitCode: 2,
      error: { message: `No override for ${tool} on ${alias}.` },
    };
  }

  return {
    success: true,
    message: `Override removed: ${tool} for ${alias} (back to its default)`,
    exitCode: 0,
  };
}
