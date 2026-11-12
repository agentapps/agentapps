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

import { readStationMeta } from '../station-lifecycle.js';
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

async function callStation(
  context: HandlerContext,
  path: string,
  init?: { method: string; body: string },
): Promise<{ status: number; body: Record<string, unknown> } | HandlerResult> {
  const meta = readStationMeta(context.ctx.configPath);
  if (!meta) {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'No station is running.', suggestion: 'Start one with: station start' },
    };
  }
  let res: Response;
  try {
    res = await fetch(`${meta.url}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(meta.adminToken ? { authorization: `Bearer ${meta.adminToken}` } : {}),
      },
      ...(init ? { body: init.body } : {}),
    });
  } catch {
    // station.json outlived its daemon (crash, reboot): nothing is listening.
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `No station is answering at ${meta.url}.`,
        suggestion: 'Start one with: station start',
      },
    };
  }
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
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
