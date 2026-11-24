/**
 * @agentapps/cli — rename command.
 */

import { isResult, StationError, stationOf } from '../station-client.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

/** @spec STADMIN-REQ-6 */
export async function handleRename(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'rename') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected rename command' },
    };
  }

  const { alias, newAlias } = command;
  const station = stationOf(context);
  if (isResult(station)) return station;

  // A kept session is keyed by alias — close it so the old key can't leak.
  await context.sessions?.release(alias);

  try {
    await station.api('PATCH', `/api/installations/${encodeURIComponent(alias)}`, {
      alias: newAlias,
    });
  } catch (err) {
    if (err instanceof StationError && err.status === 404) {
      return { success: false, exitCode: 2, error: { message: `Alias "${alias}" not found` } };
    }
    return station.failure(err);
  }

  return {
    success: true,
    message: `Renamed ${alias} → ${newAlias}`,
    exitCode: 0,
  };
}
