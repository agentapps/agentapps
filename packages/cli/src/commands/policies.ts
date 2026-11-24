/**
 * @agentapps/cli — policy commands.
 *
 * One Policy per Principal (POLICY-REQ-2), kept by the Station. A Principal
 * is named by its id, `admin`, or the name of an active API Key
 * (POLICY-REQ-15); the Station resolves it among those of the Workspace.
 */

import { type Policy, type Rule, RuleConditionSchema } from '@agentapps/protocol';
import { isResult, type StationClient, StationError, stationOf } from '../station-client.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

/** The Policy of a Principal as the Station answers it, or the result for one that does not exist. */
async function policyOf(
  station: StationClient,
  given: string,
): Promise<{ policy: Policy; label: string } | HandlerResult> {
  try {
    const policy = await station.api<Policy>('GET', `/api/policies/${encodeURIComponent(given)}`);
    const label = policy.principalId === given ? given : `${given} (${policy.principalId})`;
    return { policy, label };
  } catch (err) {
    if (err instanceof StationError && err.status === 404) {
      // POLICY-REQ-15: a Rule is never kept for a Principal that does not exist.
      return invalid(
        `No Principal is called ${given}`,
        'Use admin, a Principal id, or the name of an active API key (see: key list).',
      );
    }
    throw err;
  }
}

function putRules(station: StationClient, policy: Policy, rules: Rule[]): Promise<Policy> {
  return station.api<Policy>('PUT', `/api/policies/${encodeURIComponent(policy.principalId)}`, {
    rules,
  });
}

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
  const station = stationOf(context);
  if (isResult(station)) return station;
  try {
    const { policies } = await station.api<{ policies: Array<Policy & { stored: boolean }> }>(
      'GET',
      '/api/policies',
    );
    const stored = policies.filter((p) => p.stored);
    if (stored.length === 0) {
      return {
        success: true,
        message: 'No policies stored: every Principal uses the default Policy.',
        exitCode: 0,
      };
    }
    const data: Record<string, ResultValue> = {};
    for (const p of stored) {
      data[p.principalId] = {
        default: p.defaultEffect,
        rules: p.rules.length,
        approver: p.approver,
      };
    }
    return { success: true, data: { Policies: data } as unknown as ResultValue, exitCode: 0 };
  } catch (err) {
    return station.failure(err);
  }
}

/** @spec POLICY-REQ-2 */
export async function handlePolicyShow(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'policy-show') return internal();
  const station = stationOf(context);
  if (isResult(station)) return station;
  try {
    const who = await policyOf(station, command.principalId);
    if (!('policy' in who)) return who;
    const { policy } = who;
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
  } catch (err) {
    return station.failure(err);
  }
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
  const station = stationOf(context);
  if (isResult(station)) return station;
  try {
    const who = await policyOf(station, command.principalId);
    if (!('policy' in who)) return who;
    const id = when
      ? `${command.app}/${command.tool}#${JSON.stringify(when)}`
      : `${command.app}/${command.tool}`;
    const rules = who.policy.rules.filter((r) => r.id !== id);
    rules.push({
      id,
      app: command.app,
      tool: command.tool,
      effect: command.effect,
      ...(when ? { when } : {}),
    });
    await putRules(station, who.policy, rules);
    return {
      success: true,
      message: `${who.label}: ${command.app}/${command.tool} → ${command.effect}${when ? ` when ${JSON.stringify(when)}` : ''} (rule ${id})`,
      exitCode: 0,
    };
  } catch (err) {
    return station.failure(err);
  }
}

/** @spec POLICY-REQ-3 */
export async function handlePolicyUnset(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'policy-unset') return internal();
  const station = stationOf(context);
  if (isResult(station)) return station;
  try {
    const who = await policyOf(station, command.principalId);
    if (!('policy' in who)) return who;
    const rules = who.policy.rules.filter((r) => r.id !== command.ruleId);
    if (rules.length === who.policy.rules.length) {
      return invalid(`No rule ${command.ruleId} in ${who.label}'s Policy`);
    }
    await putRules(station, who.policy, rules);
    return { success: true, message: `Removed rule ${command.ruleId}`, exitCode: 0 };
  } catch (err) {
    return station.failure(err);
  }
}

/** @spec POLICY-REQ-2 */
export async function handlePolicyDelete(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'policy-delete') return internal();
  const station = stationOf(context);
  if (isResult(station)) return station;
  try {
    const who = await policyOf(station, command.principalId);
    if (!('policy' in who)) return who;
    const { removed } = await station.api<{ removed: boolean }>(
      'DELETE',
      `/api/policies/${encodeURIComponent(who.policy.principalId)}`,
    );
    if (!removed) return invalid(`No stored Policy for ${who.label}`);
    return {
      success: true,
      message: `${who.label} is back to the default Policy`,
      exitCode: 0,
    };
  } catch (err) {
    return station.failure(err);
  }
}

function internal(): HandlerResult {
  return { success: false, exitCode: 2, error: { message: 'Internal error' } };
}

function invalid(message: string, suggestion?: string): HandlerResult {
  return { success: false, exitCode: 2, error: { message, ...(suggestion ? { suggestion } : {}) } };
}
