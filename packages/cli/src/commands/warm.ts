/**
 * @agentapps/cli — warm command.
 *
 * Lists the tools of every Installation through the Station and caches them
 * for Tab completion.
 */

import { isResult, stationOf } from '../station-client.js';
import { listInstallations, withSession } from '../station-session.js';
import { writeCachedTools } from '../tools-cache.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

interface WarmResult {
  alias: string;
  appId: string;
  tools: number;
  error?: string;
}

/** @spec CLIENT-REQ-1 */
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
  const station = stationOf(context);
  if (isResult(station)) return station;

  let instances: Awaited<ReturnType<typeof listInstallations>>;
  try {
    instances = await listInstallations(station);
  } catch (err) {
    return station.failure(err);
  }

  if (instances.length === 0) {
    return {
      success: true,
      exitCode: 0,
      message: 'No installed apps to warm.',
    };
  }

  const results: WarmResult[] = [];
  for (const instance of instances) {
    try {
      const tools = await withSession(station, instance, undefined, (session) =>
        session.listTools(),
      );
      writeCachedTools(ctx.configPath, instance.appId, tools as never);
      results.push({ alias: instance.alias, appId: instance.appId, tools: tools.length });
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
