/**
 * @agentapps/cli — permissions commands.
 *
 * `permissions <alias>` shows what the CLI's own Policy gives each tool of an
 * Installation; `set` and `remove` change the per-tool Rules of that Policy.
 * The Policy is the Station's: these are shortcuts over `policy`.
 */

import type { Policy, Rule } from '@agentapps/protocol';
import { evaluatePolicy } from '@agentapps/station';
import { color, GREEN, RED, YELLOW } from '../render/colors.js';
import { isResult, type StationClient, stationOf } from '../station-client.js';
import { findInstallation, type InstallationInfo, withSession } from '../station-session.js';
import { writeCachedTools } from '../tools-cache.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

function unknownInstallation(alias: string): HandlerResult {
  return {
    success: false,
    exitCode: 2,
    error: {
      message: `Unknown Installation: ${alias}`,
      suggestion: 'Run "installations" to see installed apps.',
    },
  };
}

/** The Policy of the Principal the CLI is to its Station. */
async function ownPolicy(station: StationClient): Promise<Policy> {
  const { principalId } = await station.whoami();
  return station.api<Policy>('GET', `/api/policies/${encodeURIComponent(principalId)}`);
}

function toolRuleId(appId: string, tool: string): string {
  return `${appId}/${tool}`;
}

/** Per-tool Rules of a Policy for an App, by tool name. Rules with a condition are not overrides. */
function overridesOf(policy: Policy, appId: string): Record<string, Rule['effect']> {
  const out: Record<string, Rule['effect']> = {};
  for (const r of policy.rules) {
    if (r.app === appId && r.tool !== '*' && !r.when) out[r.tool] = r.effect;
  }
  return out;
}

async function changeRules(
  station: StationClient,
  instance: InstallationInfo,
  change: (rules: Rule[], id: string) => Rule[] | undefined,
  tool: string,
): Promise<boolean> {
  const policy = await ownPolicy(station);
  const rules = change(policy.rules, toolRuleId(instance.appId, tool));
  if (!rules) return false;
  await station.api('PUT', `/api/policies/${encodeURIComponent(policy.principalId)}`, { rules });
  return true;
}

/** @spec POLICY-REQ-3 */
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
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    const instance = await findInstallation(station, alias);
    if (!instance) return unknownInstallation(alias);

    const tools = await withSession(station, instance, context.sessions, (session) =>
      session.listTools(),
    );
    writeCachedTools(context.ctx.configPath, instance.appId, tools as never);
    const policy = await ownPolicy(station);
    const overrides = overridesOf(policy, instance.appId);

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
        // What the Policy gives a call without arguments; Rules with
        // argument conditions decide per call (POLICY-REQ-3).
        const override = overrides[t.name];
        const effective = evaluatePolicy(policy, {
          app: instance.appId,
          tool: t.name,
          args: {},
          annotations: t.annotations,
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
  } catch (err) {
    return station.failure(err);
  }
}

/** @spec POLICY-REQ-3 */
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
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    const instance = await findInstallation(station, alias);
    if (!instance) return unknownInstallation(alias);
    await changeRules(
      station,
      instance,
      (rules, id) => [
        ...rules.filter((r) => r.id !== id),
        { id, app: instance.appId, tool, effect },
      ],
      tool,
    );
    return {
      success: true,
      message: `Override set: ${tool} → ${effect} for ${alias}`,
      exitCode: 0,
    };
  } catch (err) {
    return station.failure(err);
  }
}

/** @spec POLICY-REQ-3 */
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
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    const instance = await findInstallation(station, alias);
    if (!instance) return unknownInstallation(alias);
    const removed = await changeRules(
      station,
      instance,
      (rules, id) => {
        const kept = rules.filter((r) => r.id !== id);
        return kept.length === rules.length ? undefined : kept;
      },
      tool,
    );
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
  } catch (err) {
    return station.failure(err);
  }
}
