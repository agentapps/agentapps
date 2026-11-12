/**
 * Policy evaluation (docs/specs/policies.md, POLICY-REQ-2..4).
 */

import type { Policy } from '@agentapps/protocol';
import { describe, expect, it } from 'vitest';
import { defaultPolicy, evaluatePolicy } from '../src/permission-enforcer.js';
import { InMemoryPolicyStore, policyFor } from '../src/policy-store.js';

function policy(rules: Policy['rules'], defaultEffect: Policy['defaultEffect'] = 'allow'): Policy {
  return { ...defaultPolicy('ak_1'), rules, defaultEffect };
}

const send = (args: Record<string, unknown> = {}) => ({ app: 'gmail', tool: 'send_email', args });

describe('Policy evaluation', () => {
  it('[POLICY-AC-2] a new Principal gets allow by default plus the two default ask Rules', async () => {
    const store = new InMemoryPolicyStore();
    const p = await policyFor(store, 'ak_new');
    expect(p.principalId).toBe('ak_new');
    expect(p.approver).toBe('admin');
    expect(p.defaultEffect).toBe('allow');
    expect(p.rules.map((r) => [r.id, r.effect, r.when])).toEqual([
      ['default-destructive', 'ask', { annotation: 'destructiveHint' }],
      ['default-sensitive', 'ask', { annotation: 'sensitive' }],
    ]);
    // Nothing is stored until someone changes it.
    expect(await store.get('ak_new')).toBeNull();
  });

  it('[POLICY-AC-3] an argument condition beats a plain tool Rule; other values fall through', () => {
    const p = policy([
      {
        id: 'team',
        app: 'gmail',
        tool: 'send_email',
        effect: 'allow',
        when: { to: { endsWith: '@hexagon.sh' } },
      },
      { id: 'others', app: 'gmail', tool: 'send_email', effect: 'ask' },
    ]);
    expect(evaluatePolicy(p, send({ to: 'ana@hexagon.sh' }))).toEqual({
      effect: 'allow',
      rule: 'team',
    });
    expect(evaluatePolicy(p, send({ to: 'pepe@gmail.com' }))).toEqual({
      effect: 'ask',
      rule: 'others',
    });
    // A missing argument never matches a positive condition.
    expect(evaluatePolicy(p, send())).toEqual({ effect: 'ask', rule: 'others' });
  });

  it('orders by specificity: app+tool > app+* > *+* > default; first declared wins a tie', () => {
    const p = policy(
      [
        { id: 'all', app: '*', tool: '*', effect: 'deny' },
        { id: 'app', app: 'gmail', tool: '*', effect: 'ask' },
        { id: 'tool-1', app: 'gmail', tool: 'send_email', effect: 'allow' },
        { id: 'tool-2', app: 'gmail', tool: 'send_email', effect: 'deny' },
      ],
      'ask',
    );
    expect(evaluatePolicy(p, send()).rule).toBe('tool-1');
    expect(evaluatePolicy(p, { app: 'gmail', tool: 'read', args: {} }).rule).toBe('app');
    expect(evaluatePolicy(p, { app: 'drive', tool: 'read', args: {} }).rule).toBe('all');
    expect(evaluatePolicy(policy([], 'ask'), send())).toEqual({ effect: 'ask', rule: 'default' });
  });

  it('supports equals, startsWith, matches, in and not', () => {
    const rule = (when: NonNullable<Policy['rules'][number]['when']>) =>
      policy([{ id: 'r', app: 'gmail', tool: 'send_email', effect: 'deny', when }]);
    expect(evaluatePolicy(rule({ to: { equals: 'a@b.c' } }), send({ to: 'a@b.c' })).rule).toBe('r');
    expect(evaluatePolicy(rule({ to: { startsWith: 'ceo' } }), send({ to: 'ceo@x' })).rule).toBe(
      'r',
    );
    expect(evaluatePolicy(rule({ to: { matches: '*@x.*' } }), send({ to: 'a@x.io' })).rule).toBe(
      'r',
    );
    expect(evaluatePolicy(rule({ to: { in: ['a', 'b'] } }), send({ to: 'b' })).rule).toBe('r');
    expect(evaluatePolicy(rule({ to: { in: ['a', 'b'] } }), send({ to: 'c' })).rule).toBe(
      'default',
    );
  });

  it('[POLICY-AC-4] Annotations decide only through Rules: removing the default Rule allows the tool', () => {
    const destructive = {
      app: 'gmail',
      tool: 'delete',
      args: {},
      annotations: { destructiveHint: true },
    };
    const p = defaultPolicy('ak_1');
    expect(evaluatePolicy(p, destructive)).toEqual({ effect: 'ask', rule: 'default-destructive' });
    const edited = { ...p, rules: p.rules.filter((r) => r.id !== 'default-destructive') };
    expect(evaluatePolicy(edited, destructive)).toEqual({ effect: 'allow', rule: 'default' });
    expect(evaluatePolicy(p, { ...destructive, annotations: { sensitive: true } }).rule).toBe(
      'default-sensitive',
    );
  });
});
