/**
 * @agentapps/cli — the Approver's commands (POLICY-REQ-7).
 *
 *   approvals         — list the calls parked on an ask in the running station
 *   approve <id>      — let one parked call through
 *   deny <id>         — refuse one parked call
 *
 * The station launched by `serve` hands this CLI a local admin token, kept in
 * `.agentapps/station.json`, so the CLI answers as the `admin` Principal.
 */

import { isResult, StationError, stationOf } from '../station-client.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

interface PendingApproval {
  id: string;
  principalId: string;
  app: string;
  tool: string;
  args: Record<string, unknown>;
  rule: string;
  expiresAt: string;
}

/** One request to the Station's approvals, as the Approver the CLI is. */
async function callStation(
  context: HandlerContext,
  path: string,
  init?: { method: string; body: string },
): Promise<{ status: number; body: Record<string, unknown> } | HandlerResult> {
  const station = stationOf(context);
  if (isResult(station)) return station;
  try {
    const body = await station.api<Record<string, unknown>>(
      init?.method ?? 'GET',
      path,
      init ? JSON.parse(init.body) : undefined,
    );
    return { status: 200, body };
  } catch (err) {
    if (err instanceof StationError && err.status !== 401) {
      return { status: err.status, body: err.body };
    }
    return station.failure(err);
  }
}

/** @spec POLICY-REQ-7 */
export async function handleApprovals(
  _command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  const result = await callStation(context, '/approvals');
  if ('success' in result) return result;
  if (result.status !== 200) {
    return { success: false, exitCode: 1, error: { message: String(result.body.error) } };
  }
  const pending = (result.body.approvals as PendingApproval[]) ?? [];
  if (pending.length === 0) {
    return { success: true, message: 'No pending approvals.', exitCode: 0 };
  }
  const now = Date.now();
  const rows = pending.map((a) => ({
    id: a.id,
    principal: a.principalId,
    app: a.app,
    tool: a.tool,
    arguments: JSON.stringify(a.args),
    rule: a.rule,
    'time left': `${Math.max(0, Math.round((new Date(a.expiresAt).getTime() - now) / 1000))}s`,
  }));
  return {
    success: true,
    data: rows as unknown as ResultValue,
    message: `${pending.length} pending approval${pending.length === 1 ? '' : 's'} · approve <id> | deny <id>`,
    exitCode: 0,
  };
}

/** @spec POLICY-REQ-7 */
export async function handleApprovalDecide(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'approval-decide') {
    return { success: false, exitCode: 2, error: { message: 'Internal error' } };
  }
  const result = await callStation(context, `/approvals/${encodeURIComponent(command.id)}`, {
    method: 'POST',
    body: JSON.stringify({ decision: command.decision }),
  });
  if ('success' in result) return result;
  if (result.status !== 200) {
    return { success: false, exitCode: 1, error: { message: String(result.body.error) } };
  }
  return {
    success: true,
    message: `${command.decision === 'approve' ? 'Approved' : 'Denied'} ${command.id}`,
    exitCode: 0,
  };
}
