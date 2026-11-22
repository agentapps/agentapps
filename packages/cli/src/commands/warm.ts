/**
 * @agentapps/cli — warm command.
 *
 * Iterates every installed instance, opens a session, lists its tools, and
 * persists the result to the tool cache so that tab completion is immediately
 * available without having to run each tool first.
 */

import { resolveSourcePath } from '../config.js';
import { resolveApp } from '../resolve.js';
import { openAppSession } from '../session.js';
import { loadInstallations } from '../state.js';
import { writeCachedTools } from '../tools-cache.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

interface WarmResult {
  alias: string;
  appId: string;
  tools: number;
  error?: string;
}

export async function handleWarm(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'warm') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected warm command' },
    };
  }

  const { ctx } = context;
  const instances = loadInstallations(ctx.configPath);

  if (instances.length === 0) {
    return {
      success: true,
      exitCode: 0,
      message: 'No installed apps to warm.',
    };
  }

  const results: WarmResult[] = [];

  for (const instance of instances) {
    const entry = ctx.config.apps[instance.appId];
    if (!entry) {
      results.push({
        alias: instance.alias,
        appId: instance.appId,
        tools: 0,
        error: 'App configuration missing',
      });
      continue;
    }

    try {
      const source = resolveSourcePath(ctx.configPath, entry.source);
      const app = await resolveApp(instance.appId, source);
      const { session, shutdown } = await openAppSession(app, ctx, instance.installationId);

      try {
        const tools = await session.listTools();
        writeCachedTools(ctx.configPath, instance.appId, tools);
        results.push({ alias: instance.alias, appId: instance.appId, tools: tools.length });
      } finally {
        await session.close();
        await shutdown();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ alias: instance.alias, appId: instance.appId, tools: 0, error: message });
    }
  }

  const succeeded = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);
  const totalTools = succeeded.reduce((sum, r) => sum + r.tools, 0);

  const parts: string[] = [];
  parts.push(`${instances.length} Installation${instances.length === 1 ? '' : 's'}`);
  parts.push(`${succeeded.length} warmed`);
  parts.push(`${totalTools} tool${totalTools === 1 ? '' : 's'} cached`);
  if (failed.length > 0) {
    parts.push(`${failed.length} failed`);
  }

  return {
    success: failed.length === 0,
    exitCode: failed.length > 0 ? 1 : 0,
    data: results.map((r) =>
      r.error
        ? { Alias: r.alias, Status: '✗', Tools: 0, Error: r.error }
        : { Alias: r.alias, Status: '✓', Tools: r.tools },
    ) as unknown as ResultValue,
    message: parts.join(', '),
  };
}
