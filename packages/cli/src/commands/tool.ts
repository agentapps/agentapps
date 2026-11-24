/**
 * @agentapps/cli — tool command.
 *
 * Calls a tool of an Installation through the Station, on the route a
 * Gateway uses, so the caller's Policy and Approvals apply to it.
 */

import { userInfo } from 'node:os';
import { readLine } from '../prompt.js';
import { isResult, type StationClient, StationError, stationOf } from '../station-client.js';
import {
  errorOf,
  findInstallation,
  type InstallationInfo,
  type StationSession,
  unknownAlias,
  withSession,
} from '../station-session.js';
import { parseToolArgs } from '../tool-args.js';
import { writeCachedTools } from '../tools-cache.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

/** How long a tool call may take, an Approval included. */
const TOOL_CALL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * @spec CLIENT-REQ-1
 * @spec CLIENT-REQ-3
 */
export async function handleTool(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'tool') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected tool command' },
    };
  }

  const { alias, toolName, args: rawArgTokens } = command;

  // Accept `-y` / `--yes` to approve an `ask` call. In one-shot mode it is a
  // global flag (already in options.yes); in the REPL it arrives among the tool
  // args, so strip it here and treat it as consent.
  const yesInArgs = rawArgTokens.some((t) => t === '-y' || t === '--yes');
  const argTokens = rawArgTokens.filter((t) => t !== '-y' && t !== '--yes');
  const confirmed = context.options.yes || yesInArgs;

  let args: Record<string, unknown>;
  try {
    args = parseToolArgs(argTokens).args;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      exitCode: 2,
      error: {
        message,
        suggestion: 'Use either a single JSON argument or only key:value arguments.',
      },
    };
  }

  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    const instance = await findInstallation(station, alias);
    if (!instance) return unknownAlias(alias);
    const notReady = authProblem(instance);
    if (notReady) return notReady;

    return await withSession(station, instance, context.sessions, async (session) => {
      const tools = await session.listTools();
      writeCachedTools(context.ctx.configPath, instance.appId, tools as never);
      // A tool the caller's Policy always denies is not listed (POLICY-REQ-11):
      // it is still called, so the Station says which Rule denies it.
      const tool = tools.find((t) => t.name === toolName);
      const missing = tool ? validateRequired(args, tool.parameters) : [];
      if (tool && missing.length > 0) {
        return {
          success: false,
          exitCode: 2,
          error: {
            message: `Missing required argument: ${missing[0]}`,
            suggestion: `Usage:\n  ${alias} tool ${toolName} ${formatUsage(tool.parameters)}`,
          },
        };
      }

      const { answer, declined } = await callAndApprove(
        station,
        session,
        instance,
        toolName,
        args,
        confirmed,
      );
      if (declined !== undefined) {
        // The Approver at this terminal said no, or could not be asked.
        return {
          success: false,
          exitCode: 2,
          error: {
            message: `Tool '${toolName}' needs approval (rule '${declined}').`,
            suggestion: `Re-run with -y to approve this call, or always allow it: permissions ${alias} set ${toolName} allow`,
          },
        };
      }
      const result = toResult(answer, alias, toolName, context.options.verbose);
      if (!tool && !result.success && result.exitCode === 1) {
        return { success: false, exitCode: 2, error: { message: `Tool not found: ${toolName}` } };
      }
      return result;
    });
  } catch (err) {
    return station.failure(err);
  }
}

/** The result for an Installation that is not signed in or lacks a secret, if so. */
function authProblem(instance: InstallationInfo): HandlerResult | undefined {
  const auth = instance.auth;
  if (!auth || auth.authenticated) return undefined;
  const { alias } = instance;
  // System secrets are configured per app id; installation secrets per instance alias.
  const missing = [...(auth.missingSecrets ?? []), ...(auth.missingUserSecrets ?? [])];
  const lines = [
    ...(auth.missingSecrets ?? []).map((n) => `  config ${instance.appId} ${n}:"<value>"`),
    ...(auth.missingUserSecrets ?? []).map((n) => `  config ${alias} ${n}:"<value>"`),
  ];
  return {
    success: false,
    exitCode: 2,
    error: {
      message:
        auth.kind === 'api-key'
          ? `${alias} is missing its API key (${missing.join(', ')})`
          : `${alias} is not authenticated`,
      suggestion:
        auth.kind === 'api-key'
          ? `Set the missing secret${missing.length > 1 ? 's' : ''} with:\n${lines.join('\n')}`
          : `Run "${alias} auth" first.`,
    },
  };
}

interface PendingApproval {
  id: string;
  app: string;
  tool: string;
  rule: string;
  principalId: string;
}

/**
 * Call the tool, and answer the Approval it parks on when the CLI is its
 * Approver: `-y` approves up front, a terminal is asked, anything else denies
 * (POLICY-REQ-7). A caller that is not the Approver waits for whoever is.
 *
 * @spec CLIENT-REQ-3
 */
async function callAndApprove(
  station: StationClient,
  session: StationSession,
  instance: InstallationInfo,
  toolName: string,
  args: Record<string, unknown>,
  confirmed: boolean,
): Promise<{ answer: Record<string, unknown>; declined?: string }> {
  let declined: string | undefined;
  let settled = false;
  const call = session
    .send(
      {
        type: 'tool_call',
        tool: toolName,
        arguments: args,
        // Who the call is for, as an App receives it.
        context: { userId: userInfo().username, installationId: instance.installationId },
      },
      TOOL_CALL_TIMEOUT_MS,
    )
    .finally(() => {
      settled = true;
    });
  // An unobserved rejection while the Approval is being answered must not end the process.
  call.catch(() => {});

  const me = await station.whoami().catch(() => undefined);
  let approver = me?.owner === true;
  const answered = new Set<string>();
  for (let wait = 25; !settled; wait = Math.min(wait * 2, 400)) {
    await Promise.race([call.catch(() => {}), new Promise((done) => setTimeout(done, wait))]);
    if (settled || !approver) continue;
    let pending: PendingApproval[];
    try {
      pending = (await station.api<{ approvals: PendingApproval[] }>('GET', '/approvals'))
        .approvals;
    } catch (err) {
      if (err instanceof StationError && err.status === 403) approver = false;
      continue;
    }
    const mine = pending.find(
      (a) =>
        a.app === instance.appId &&
        a.tool === toolName &&
        a.principalId === me?.principalId &&
        !answered.has(a.id),
    );
    if (!mine) continue;
    answered.add(mine.id);
    const approve =
      confirmed ||
      (process.stdin.isTTY === true &&
        /^y(es)?$/i.test(
          await askLine(`  Approve ${toolName} on ${instance.alias} (rule ${mine.rule})? [y/N] `),
        ));
    if (!approve) declined = mine.rule;
    await station
      .api('POST', `/approvals/${encodeURIComponent(mine.id)}`, {
        decision: approve ? 'approve' : 'deny',
      })
      .catch(() => {});
  }
  return { answer: await call, ...(declined !== undefined ? { declined } : {}) };
}

/** What the Station answered, as the command's result. */
function toResult(
  answer: Record<string, unknown>,
  alias: string,
  toolName: string,
  verbose: boolean,
): HandlerResult {
  const error = errorOf(answer);
  if (answer.type !== 'tool_result') {
    const rule = error?.details?.rule;
    if (error?.code === 'PERMISSION_DENIED' && error.details?.layer === 'policy') {
      return {
        success: false,
        exitCode: 2,
        error: {
          message: `Tool '${toolName}' is denied for ${alias} by rule '${String(rule)}'.`,
          suggestion: `Allow it with: permissions ${alias} set ${toolName} allow`,
        },
      };
    }
    if (error?.code === 'APPROVAL_TIMEOUT') {
      return {
        success: false,
        exitCode: 2,
        error: {
          message: `Tool '${toolName}' needs approval (rule '${String(rule)}').`,
          suggestion: `Re-run with -y to approve this call, or always allow it: permissions ${alias} set ${toolName} allow`,
        },
      };
    }
    return {
      success: false,
      exitCode: 1,
      error: { message: error?.message ?? 'Tool execution failed' },
    };
  }

  if (answer.success === false) {
    return {
      success: false,
      exitCode: 1,
      error: { message: error?.message ?? 'Tool execution failed' },
    };
  }

  // HOSTCAP-REQ-4: the CLI draws no UI Components, so it prints the
  // Renderer's markdown or text variant when the app provides one.
  const variants = (answer.renderer as { variants?: Record<string, string> } | undefined)?.variants;
  const variant = variants?.markdown ?? variants?.text;
  // CLI-REQ-2: a successful call prints only its result unless --verbose.
  return {
    success: true,
    ...(verbose ? { message: `${toolName} succeeded` } : {}),
    data: answer.result as ResultValue,
    ...(variant !== undefined ? { variant } : {}),
    exitCode: 0,
  };
}

function validateRequired(
  args: Record<string, unknown>,
  params?: Record<string, unknown>,
): string[] {
  if (!params) return [];
  const required = (params.required as string[]) ?? [];
  return required.filter((key) => !(key in args));
}

/** One-line usage signature: `key:<type>` per parameter, `?` marks optional. */
export function formatUsage(params?: Record<string, unknown>): string {
  if (!params) return '';
  const properties = params.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return '';
  const required = new Set((params.required as string[]) ?? []);
  return Object.keys(properties)
    .map(
      (key) =>
        `${key}:<${(properties[key]?.type as string) ?? 'string'}>${required.has(key) ? '' : '?'}`,
    )
    .join(' ');
}

/** Ask one question on the terminal and return the answer. */
async function askLine(question: string): Promise<string> {
  process.stderr.write(question);
  return readLine(process.stdin);
}
