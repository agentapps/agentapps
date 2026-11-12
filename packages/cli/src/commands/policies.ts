/**
 * @agentapps/cli — Policy commands (one Policy per Principal).
 *
 * Usage:
 *   policy list                                         — every Principal's Policy
 *   policy show <principal>                             — one Policy (default if none stored)
 *   policy set <principal> <app> <tool> <effect> [when] — add or replace a Rule
 *   policy unset <principal> <ruleId>                   — remove a Rule
 *   policy delete <principal>                           — back to the default Policy
 *
 * `app` and `tool` accept `*`; `when` is the Rule's condition as JSON, e.g.
 * `{"to":{"endsWith":"@hexagon.sh"}}` or `{"annotation":"sensitive"}`.
 */

import { type Rule, RuleConditionSchema } from '@agentapps/protocol';
import { getPolicy, loadPolicies, putPolicy, savePolicies } from '../state.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

function describeRule(r: Rule): Record<string, ResultValue> {
  return {
    app: r.app,
    tool: r.tool,
    effect: r.effect,
    ...(r.when ? { when: JSON.stringify(r.when) } : {}),
  };
}

/** @spec POLICY-REQ-2 */
export async function handlePolicyList(
  _command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  const policies = loadPolicies(context.ctx.configPath);
  if (policies.length === 0) {
    return {
      success: true,
      message: 'No policies stored: every Principal uses the default Policy.',
      exitCode: 0,
    };
  }
  const data: Record<string, ResultValue> = {};
  for (const p of policies) {
    data[p.principalId] = { default: p.defaultEffect, rules: p.rules.length, approver: p.approver };
  }
  return { success: true, data: { Policies: data } as unknown as ResultValue, exitCode: 0 };
}

/** @spec POLICY-REQ-2 */
export async function handlePolicyShow(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'policy-show') return internal();
  const policy = getPolicy(context.ctx.configPath, command.principalId);
  const rules: Record<string, ResultValue> = {};
  for (const r of policy.rules) rules[r.id] = describeRule(r);
  return {
    success: true,
    data: {
      principal: policy.principalId,
      approver: policy.approver,
      default: policy.defaultEffect,
      rules,
    } as unknown as ResultValue,
    exitCode: 0,
  };
}

/** @spec POLICY-REQ-3 */
export async function handlePolicySet(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'policy-set') return internal();
  let when: Rule['when'];
  if (command.when !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(command.when);
    } catch {
      return invalid(`Condition is not JSON: ${command.when}`);
    }
    const result = RuleConditionSchema.safeParse(parsed);
    if (!result.success) return invalid(`Invalid condition: ${result.error.message}`);
    when = result.data;
  }
  const policy = getPolicy(context.ctx.configPath, command.principalId);
  const id = when
    ? `${command.app}/${command.tool}#${JSON.stringify(when)}`
    : `${command.app}/${command.tool}`;
  const rules = policy.rules.filter((r) => r.id !== id);
  rules.push({
    id,
    app: command.app,
    tool: command.tool,
    effect: command.effect,
    ...(when ? { when } : {}),
  });
  putPolicy(context.ctx.configPath, { ...policy, rules });
  return {
    success: true,
    message: `${command.principalId}: ${command.app}/${command.tool} → ${command.effect}${when ? ` when ${JSON.stringify(when)}` : ''} (rule ${id})`,
    exitCode: 0,
  };
}

/** @spec POLICY-REQ-3 */
export async function handlePolicyUnset(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'policy-unset') return internal();
  const policy = getPolicy(context.ctx.configPath, command.principalId);
  const rules = policy.rules.filter((r) => r.id !== command.ruleId);
  if (rules.length === policy.rules.length) {
    return invalid(`No rule ${command.ruleId} in ${command.principalId}'s Policy`);
  }
  putPolicy(context.ctx.configPath, { ...policy, rules });
  return { success: true, message: `Removed rule ${command.ruleId}`, exitCode: 0 };
}

/** @spec POLICY-REQ-2 */
export async function handlePolicyDelete(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'policy-delete') return internal();
  const policies = loadPolicies(context.ctx.configPath);
  const kept = policies.filter((p) => p.principalId !== command.principalId);
  if (kept.length === policies.length) {
    return invalid(`No stored Policy for ${command.principalId}`);
  }
  savePolicies(context.ctx.configPath, kept);
  return {
    success: true,
    message: `${command.principalId} is back to the default Policy`,
    exitCode: 0,
  };
}

function internal(): HandlerResult {
  return { success: false, exitCode: 2, error: { message: 'Internal error' } };
}

function invalid(message: string): HandlerResult {
  return { success: false, exitCode: 2, error: { message } };
}
