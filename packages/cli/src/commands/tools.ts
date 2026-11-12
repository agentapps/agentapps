/**
 * @agentapps/cli — tools command.
 */

import { resolveSourcePath } from '../config.js';
import { resolveApp } from '../resolve.js';
import { openAppSession } from '../session.js';
import { getInstallation } from '../state.js';
import { writeCachedTools } from '../tools-cache.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import { formatUsage } from './tool.js';
import type { HandlerContext } from './types.js';

export async function handleTools(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'tools') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected tools command' },
    };
  }

  const { alias } = command;
  const { ctx, options } = context;
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

  // In the REPL, reuse the persistent per-alias session (see SessionPool).
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

    if (options.verbose) {
      return {
        success: true,
        data: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: formatParameters(tool.parameters as Record<string, unknown> | undefined),
        })),
        message: `${tools.length} tool${tools.length === 1 ? '' : 's'} available`,
        exitCode: 0,
      };
    }

    return {
      success: true,
      data: tools.map((tool) => ({
        Tool: tool.name,
        Parameters: formatUsage(tool.parameters as Record<string, unknown> | undefined) || '—',
        Description: tool.description,
      })),
      layout: 'entries',
      message: `${tools.length} tool${tools.length === 1 ? '' : 's'} available`,
      exitCode: 0,
    };
  } catch (err) {
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

function formatParameters(params?: Record<string, unknown>): Record<string, string> {
  if (!params) return { '(none)': '' };
  const properties = params.properties as Record<string, Record<string, unknown>> | undefined;
  const required = new Set((params.required as string[]) ?? []);
  if (!properties || Object.keys(properties).length === 0) return { '(none)': '' };

  const result: Record<string, string> = {};
  for (const [key, schema] of Object.entries(properties)) {
    const type = (schema.type as string) ?? 'any';
    const req = required.has(key) ? 'required' : 'optional';
    const desc = (schema.description as string) ?? '';
    result[key] = `${type.padEnd(8)} ${req.padEnd(8)} ${desc}`;
  }
  return result;
}
