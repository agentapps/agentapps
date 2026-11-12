/**
 * Parked calls and Approver decisions (docs/specs/policies.md, POLICY-REQ-6).
 */

import { describe, expect, it } from 'vitest';
import { ApprovalManager, DEFAULT_APPROVAL_TIMEOUT_MS } from '../src/approval-manager.js';
import { InMemoryPolicyStore } from '../src/policy-store.js';

const call = {
  principalId: 'ak_1',
  app: 'gmail',
  tool: 'send_email',
  args: { to: 'x' },
  rule: 'r1',
};

describe('ApprovalManager', () => {
  it('waits 5 minutes by default', () => {
    expect(DEFAULT_APPROVAL_TIMEOUT_MS).toBe(300_000);
  });

  it('[POLICY-AC-6] lists a parked call and resolves it with the Approver decision', async () => {
    const logs: string[] = [];
    const m = new ApprovalManager({ log: (l) => logs.push(l) });
    const parked = m.park(call);
    const [pending] = m.listPending();
    expect(pending).toMatchObject({ principalId: 'ak_1', tool: 'send_email', rule: 'r1' });
    expect(m.decide(pending!.id, 'approve', 'admin')).toBe(true);
    await expect(parked).resolves.toBe('approve');
    expect(m.listPending()).toEqual([]);
    // A decided Approval cannot be decided again.
    expect(m.decide(pending!.id, 'deny', 'admin')).toBe(false);
    expect(m.decide('unknown', 'deny', 'admin')).toBe(false);
  });

  it('[POLICY-AC-6] an undecided Approval times out', async () => {
    const m = new ApprovalManager({ timeoutMs: 10, log: () => {} });
    await expect(m.park(call)).resolves.toBe('timeout');
    expect(m.listPending()).toEqual([]);
  });

  it('[POLICY-AC-10] logs pending, decision and expiry with Principal, app, tool, Rule and time', async () => {
    const logs: string[] = [];
    const m = new ApprovalManager({ timeoutMs: 10, log: (l) => logs.push(l) });
    const first = m.park(call);
    m.decide(m.listPending()[0]!.id, 'deny', 'admin');
    await first;
    await m.park(call);
    const fields = /principal=ak_1 app=gmail tool=send_email rule=r1 at=\d{4}-/;
    expect(logs.find((l) => l.includes('pending'))).toMatch(fields);
    expect(logs.find((l) => l.includes('deny by admin'))).toMatch(fields);
    expect(logs.find((l) => l.includes('expired'))).toMatch(fields);
  });
});

describe('InMemoryPolicyStore', () => {
  it('keeps one copy of a Policy per Principal', async () => {
    const store = new InMemoryPolicyStore();
    const now = new Date().toISOString();
    const p = {
      principalId: 'ak_1',
      approver: 'admin',
      defaultEffect: 'deny' as const,
      rules: [],
      createdAt: now,
      updatedAt: now,
    };
    await store.put(p);
    const got = await store.get('ak_1');
    expect(got).toEqual(p);
    got!.rules.push({ id: 'x', app: '*', tool: '*', effect: 'allow' });
    expect((await store.get('ak_1'))!.rules).toEqual([]);
    expect(await store.remove('ak_1')).toBe(true);
    expect(await store.list()).toEqual([]);
  });
});
