/**
 * PolicyStore: one Policy per Principal (POLICY-REQ-2).
 */

import type { Policy } from '@agentapps/protocol';
import { defaultPolicy } from './permission-enforcer.js';

export interface PolicyStore {
  /** Create or replace the Policy of `policy.principalId`. */
  put(policy: Policy): Promise<void>;
  /** The Policy of a Principal, or null when none is stored. */
  get(principalId: string): Promise<Policy | null>;
  /** Every stored Policy. */
  list(): Promise<Policy[]>;
  /** Remove a Principal's Policy. Returns true if it existed. */
  remove(principalId: string): Promise<boolean>;
}

/**
 * The Policy that applies to a Principal: the stored one, or the default a
 * new Principal starts with (POLICY-REQ-2).
 *
 * @spec POLICY-REQ-2
 */
export async function policyFor(store: PolicyStore, principalId: string): Promise<Policy> {
  return (await store.get(principalId)) ?? defaultPolicy(principalId);
}

/**
 * In-memory implementation (tests and embedded use).
 *
 * @spec POLICY-REQ-2
 */
export class InMemoryPolicyStore implements PolicyStore {
  private readonly data = new Map<string, Policy>();

  async put(policy: Policy): Promise<void> {
    this.data.set(policy.principalId, structuredClone(policy));
  }

  async get(principalId: string): Promise<Policy | null> {
    const p = this.data.get(principalId);
    return p ? structuredClone(p) : null;
  }

  async list(): Promise<Policy[]> {
    return [...this.data.values()].map((p) => structuredClone(p));
  }

  async remove(principalId: string): Promise<boolean> {
    return this.data.delete(principalId);
  }
}
