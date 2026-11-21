/**
 * Policy evaluation: which effect a Principal's Policy gives a tool call.
 *
 * A Policy is a list of Rules plus a default effect (POLICY-REQ-2). The most
 * specific matching Rule wins, ordered app+tool+when > app+tool > app+* >
 * *+*; among equal specificity the first declared wins; no match means the
 * default effect (POLICY-REQ-3). Annotations never decide on their own: the
 * "sensitive or destructive tools ask" behaviour is two default Rules every
 * new Policy starts with (POLICY-REQ-4).
 */

import {
  ADMIN_PRINCIPAL_ID,
  type ArgMatcher,
  type PermissionEffect,
  type Policy,
  type Rule,
  type RuleCondition,
} from '@agentapps/protocol';

/** What a Rule can be evaluated against. */
export interface ToolCallFacts {
  app: string;
  tool: string;
  args: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

/** The outcome of evaluating a Policy: the effect and the Rule that gave it. */
export interface PolicyDecision {
  effect: PermissionEffect;
  /** The deciding Rule's id, or `default` when no Rule matched. */
  rule: string;
}

/**
 * The Policy every new Principal starts with (POLICY-REQ-2, POLICY-REQ-4):
 * allow by default, ask for destructive and for sensitive tools.
 *
 * @spec POLICY-REQ-4
 */
export function defaultPolicy(principalId: string, now = new Date().toISOString()): Policy {
  return {
    principalId,
    approver: ADMIN_PRINCIPAL_ID,
    defaultEffect: 'allow',
    rules: [
      {
        id: 'default-destructive',
        app: '*',
        tool: '*',
        effect: 'ask',
        when: { annotation: 'destructiveHint' },
      },
      {
        id: 'default-sensitive',
        app: '*',
        tool: '*',
        effect: 'ask',
        when: { annotation: 'sensitive' },
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Evaluate a Policy for one tool call.
 *
 * @spec POLICY-REQ-3
 */
export function evaluatePolicy(policy: Policy, call: ToolCallFacts): PolicyDecision {
  let best: { rule: Rule; score: number } | null = null;
  for (const rule of policy.rules) {
    if (rule.app !== '*' && rule.app !== call.app) continue;
    if (rule.tool !== '*' && rule.tool !== call.tool) continue;
    if (rule.when && !conditionHolds(rule.when, call)) continue;
    const score = specificity(rule);
    // Strictly greater: among equal specificity the first declared wins.
    if (!best || score > best.score) best = { rule, score };
  }
  return best
    ? { effect: best.rule.effect, rule: best.rule.id }
    : { effect: policy.defaultEffect, rule: 'default' };
}

/** app+tool+when (3) > app+tool (2) > app+* (1) > *+* (0). */
function specificity(rule: Rule): number {
  const app = rule.app !== '*';
  const tool = rule.tool !== '*';
  if (app && tool) return rule.when ? 3 : 2;
  if (app) return 1;
  return 0;
}

function conditionHolds(when: RuleCondition, call: ToolCallFacts): boolean {
  if ('annotation' in when && typeof when.annotation === 'string') {
    return call.annotations?.[when.annotation] === true;
  }
  for (const [arg, matcher] of Object.entries(when as Record<string, ArgMatcher>)) {
    if (!matches(matcher, call.args[arg], arg in call.args)) return false;
  }
  return true;
}

/** A missing argument never matches a positive condition (POLICY-REQ-3). */
function matches(m: ArgMatcher, value: unknown, present: boolean): boolean {
  if (m.not) return !matches(m.not, value, present);
  if (!present) return false;
  if ('equals' in m && m.equals !== undefined && value !== m.equals) return false;
  if (m.startsWith !== undefined && !(typeof value === 'string' && value.startsWith(m.startsWith)))
    return false;
  if (m.endsWith !== undefined && !(typeof value === 'string' && value.endsWith(m.endsWith)))
    return false;
  if (m.matches !== undefined && !(typeof value === 'string' && globMatch(m.matches, value)))
    return false;
  if (m.in !== undefined && !m.in.includes(value)) return false;
  return true;
}

function globMatch(glob: string, value: string): boolean {
  const re = new RegExp(`^${glob.split('*').map(escapeRegExp).join('.*')}$`);
  return re.test(value);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/** A Rule whose `when` reads the call's arguments, unknown when listing. */
function dependsOnArgs(rule: Rule): boolean {
  return !!rule.when && !('annotation' in rule.when);
}

/**
 * Whether a tool stays in a Principal's tool list: hidden only when the Policy
 * denies it whatever the arguments.
 *
 * @spec POLICY-REQ-11
 */
export function toolVisible(
  policy: Policy,
  app: string,
  tool: string,
  annotations?: Record<string, unknown>,
): boolean {
  const known = { ...policy, rules: policy.rules.filter((r) => !dependsOnArgs(r)) };
  if (evaluatePolicy(known, { app, tool, args: {}, annotations }).effect !== 'deny') return true;
  return policy.rules.some(
    (r) =>
      dependsOnArgs(r) &&
      (r.app === '*' || r.app === app) &&
      (r.tool === '*' || r.tool === tool) &&
      r.effect !== 'deny',
  );
}

/**
 * Whether an Installation of `app` is listed to a Principal: hidden only when
 * the Policy denies the App as a whole.
 *
 * @spec POLICY-REQ-10
 */
export function appVisible(policy: Policy, app: string): boolean {
  const known = { ...policy, rules: policy.rules.filter((r) => !dependsOnArgs(r) && !r.when) };
  // A tool name no Rule can name stands for "any tool of this App".
  const anyTool = '\u0000';
  if (evaluatePolicy(known, { app, tool: anyTool, args: {} }).effect !== 'deny') return true;
  return policy.rules.some((r) => r.app === app && r.tool !== '*' && r.effect !== 'deny');
}
