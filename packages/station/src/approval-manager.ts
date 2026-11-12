/**
 * ApprovalManager: tool calls parked on an `ask` until their Approver decides
 * or the Approval expires (POLICY-REQ-6).
 *
 * Every pending Approval and every decision is logged with Principal, app,
 * tool, Rule and time (POLICY-REQ-7, POLICY-NFR-1).
 */

import { randomUUID } from 'node:crypto';

/** A pending Approval as the Approver sees it (POLICY-REQ-6). */
export interface PendingApprovalInfo {
  id: string;
  principalId: string;
  app: string;
  tool: string;
  args: Record<string, unknown>;
  /** The Rule that said ask, or `default`. */
  rule: string;
  createdAt: string;
  expiresAt: string;
}

/** How a parked call ends. */
export type ApprovalOutcome = 'approve' | 'deny' | 'timeout';

interface PendingApproval extends PendingApprovalInfo {
  finish: (outcome: ApprovalOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Reference timeout for an undecided Approval: 5 minutes (POLICY-REQ-6). */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Parks calls and records decisions.
 *
 * @spec POLICY-REQ-6
 */
export class ApprovalManager {
  private readonly pending = new Map<string, PendingApproval>();
  private readonly timeoutMs: number;
  private readonly log: (line: string) => void;

  constructor(options?: { timeoutMs?: number; log?: (line: string) => void }) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
    // eslint-disable-next-line no-console
    this.log = options?.log ?? ((line) => console.error(line));
  }

  /**
   * Park a call. Resolves when the Approver decides or the Approval expires.
   * `onPending` receives the Approval as soon as it exists.
   */
  park(
    call: {
      principalId: string;
      app: string;
      tool: string;
      args: Record<string, unknown>;
      rule: string;
    },
    onPending?: (info: PendingApprovalInfo) => void,
  ): Promise<ApprovalOutcome> {
    const id = randomUUID();
    const now = Date.now();
    const info: PendingApprovalInfo = {
      id,
      ...call,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.timeoutMs).toISOString(),
    };
    return new Promise<ApprovalOutcome>((resolve) => {
      const finish = (outcome: ApprovalOutcome) => {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(outcome);
      };
      const timer = setTimeout(() => {
        this.log(
          `[approvals] ${id} expired: principal=${call.principalId} app=${call.app} tool=${call.tool} rule=${call.rule} at=${new Date().toISOString()}`,
        );
        finish('timeout');
      }, this.timeoutMs);
      if (typeof timer === 'object' && 'unref' in timer) timer.unref();
      this.pending.set(id, { ...info, finish, timer });
      this.log(
        `[approvals] pending ${id}: principal=${call.principalId} app=${call.app} tool=${call.tool} rule=${call.rule} at=${info.createdAt}`,
      );
      onPending?.(info);
    });
  }

  /**
   * Record the Approver's decision for one call (POLICY-REQ-6). Returns false
   * when the Approval is unknown, already decided or expired.
   */
  decide(id: string, decision: 'approve' | 'deny', by: string): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    this.log(
      `[approvals] ${id} ${decision} by ${by}: principal=${entry.principalId} app=${entry.app} tool=${entry.tool} rule=${entry.rule} at=${new Date().toISOString()}`,
    );
    entry.finish(decision);
    return true;
  }

  /** Pending Approvals, oldest first (POLICY-REQ-7). */
  listPending(): PendingApprovalInfo[] {
    return [...this.pending.values()].map(({ finish: _f, timer: _t, ...info }) => info);
  }
}
