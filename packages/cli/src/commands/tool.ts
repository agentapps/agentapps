/**
 * @agentapps/cli — tool invocation command.
 */

import { ADMIN_PRINCIPAL_ID } from '@agentapps/protocol';
import { evaluatePolicy } from '@agentapps/station';
import { getAuthInfo } from '../auth-helper.js';
import { resolveSourcePath } from '../config.js';
import { readLine } from '../host.js';
import { resolveApp } from '../resolve.js';
import { openAppSession } from '../session.js';
import { getInstallation, getPolicy } from '../state.js';
import { parseToolArgs } from '../tool-args.js';
import { writeCachedTools } from '../tools-cache.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

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
  const { ctx } = context;

  // Accept `-y` / `--yes` to approve an `ask` call. In one-shot mode it is a
  // global flag (already in options.yes); in the REPL it arrives among the tool
  // args, so strip it here and treat it as consent.
  const yesInArgs = rawArgTokens.some((t) => t === '-y' || t === '--yes');
  const argTokens = rawArgTokens.filter((t) => t !== '-y' && t !== '--yes');
  const confirmed = context.options.yes || yesInArgs;

  const instance = getInstallation(ctx.configPath, alias);

  if (!instance) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Unknown alias: ${alias}`,
        suggestion: `Run "installations" to see installed apps, or "install <app-id> ${alias}" to create it.`,
      },
    };
  }

  const entry = ctx.config.apps[instance.appId];
  if (!entry) {
    return {
      success: false,
      exitCode: 2,
      error: { message: `App configuration missing for ${instance.appId}` },
    };
  }

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

  const auth = await getAuthInfo(instance.installationId, instance.appId, ctx);
  if (!auth.authenticated) {
    // System secrets are configured per app id; installation secrets per instance alias.
    const missing = [...(auth.missingSecrets ?? []), ...(auth.missingUserSecrets ?? [])];
    const lines = [
      ...(auth.missingSecrets ?? []).map((n) => `  config ${instance.appId} ${n}:"<value>"`),
      ...(auth.missingUserSecrets ?? []).map((n) => `  config ${alias} ${n}:"<value>"`),
    ];
    const suggestion =
      auth.kind === 'api-key'
        ? `Set the missing secret${missing.length > 1 ? 's' : ''} with:\n${lines.join('\n')}`
        : `Run "${alias} auth" first.`;
    return {
      success: false,
      exitCode: 2,
      error: {
        message:
          auth.kind === 'api-key'
            ? `${alias} is missing its API key (${missing.join(', ')})`
            : `${alias} is not authenticated`,
        suggestion,
      },
    };
  }

  // In the REPL, reuse a persistent session so stateful apps keep their
  // state across commands; one-shot mode opens an ephemeral one.
  const pooled = context.sessions
    ? await context.sessions.acquire(alias, instance.appId, ctx)
    : undefined;
  const ephemeral = pooled
    ? undefined
    : await (async () => {
        const source = resolveSourcePath(ctx.configPath, entry.source);
        const app = await resolveApp(instance.appId, source);
        return openAppSession(app, ctx, instance.installationId);
      })();
  const session = (pooled ?? ephemeral!).session;

  try {
    const tools = await session.listTools();
    writeCachedTools(ctx.configPath, instance.appId, tools);
    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      return {
        success: false,
        exitCode: 2,
        error: { message: `Tool not found: ${toolName}` },
      };
    }

    const missing = validateRequired(args, tool.parameters as Record<string, unknown> | undefined);
    if (missing.length > 0) {
      return {
        success: false,
        exitCode: 2,
        error: {
          message: `Missing required argument: ${missing[0]}`,
          suggestion: `Usage:\n  ${alias} tool ${toolName} ${formatUsage(tool.parameters as Record<string, unknown> | undefined)}`,
        },
      };
    }

    // POLICY-REQ-5: the local admin's Policy decides; the CLI is that
    // Principal's Host, so an `ask` is answered inline (POLICY-REQ-7): `-y`
    // answers yes up front, a terminal is asked, anything else is refused.
    const decision = evaluatePolicy(getPolicy(ctx.configPath, ADMIN_PRINCIPAL_ID), {
      app: instance.appId,
      tool: toolName,
      args,
      annotations: tool.annotations as Record<string, unknown> | undefined,
    });

    if (decision.effect === 'deny') {
      return {
        success: false,
        exitCode: 2,
        error: {
          message: `Tool '${toolName}' is denied for ${alias} by rule '${decision.rule}'.`,
          suggestion: `Allow it with: permissions ${alias} set ${toolName} allow`,
        },
      };
    }
    if (decision.effect === 'ask' && !confirmed) {
      const approved = process.stdin.isTTY
        ? /^y(es)?$/i.test(
            await askLine(`  Approve ${toolName} on ${alias} (rule ${decision.rule})? [y/N] `),
          )
        : false;
      if (!approved) {
        return {
          success: false,
          exitCode: 2,
          error: {
            message: `Tool '${toolName}' needs approval (rule '${decision.rule}').`,
            suggestion: `Re-run with -y to approve this call, or always allow it: permissions ${alias} set ${toolName} allow`,
          },
        };
      }
    }

    const result = await session.callTool(toolName, args, {
      userId: 'developer',
      installationId: instance.installationId,
    });

    if (result.success) {
      // HOSTCAP-REQ-4: the CLI draws no UI Components, so it prints the
      // Renderer's markdown or text variant when the app provides one.
      const variant = result.renderer?.variants?.markdown ?? result.renderer?.variants?.text;
      // CLI-REQ-2: a successful call prints only its result unless --verbose.
      return {
        success: true,
        ...(context.options.verbose ? { message: `${toolName} succeeded` } : {}),
        data: result.result as ResultValue,
        ...(variant !== undefined ? { variant } : {}),
        exitCode: 0,
      };
    }

    return {
      success: false,
      exitCode: 1,
      error: { message: result.error?.message ?? 'Tool execution failed' },
    };
  } catch (err) {
    // A thrown error (not a failed tool result) usually means the session
    // transport is broken — drop the pooled session so the next command
    // starts fresh instead of hitting a dead one.
    if (pooled) {
      await context.sessions?.release(alias);
    }
    throw err;
  } finally {
    if (ephemeral) {
      await session.close();
      await ephemeral.shutdown();
    }
  }
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
