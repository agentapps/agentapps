/**
 * @agentapps/cli — unbind command.
 */

import { isResult, stationOf } from '../station-client.js';
import { findInstallation } from '../station-session.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

/** @spec STADMIN-REQ-6 */
export async function handleUnbind(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'unbind') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected unbind command' },
    };
  }

  const { alias, bindingName } = command;
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    const consumer = await findInstallation(station, alias);
    if (!consumer) {
      return {
        success: false,
        exitCode: 2,
        error: {
          message: `Unknown Installation: ${alias}`,
          suggestion: 'Run "installations" to see installed apps.',
        },
      };
    }
    const { removed } = await station.api<{ removed: boolean }>(
      'DELETE',
      `/api/installations/${encodeURIComponent(consumer.installationId)}/bindings/${encodeURIComponent(bindingName)}`,
    );
    if (!removed) {
      return {
        success: false,
        exitCode: 2,
        error: {
          message: `No binding '${bindingName}' found for ${alias}.`,
          suggestion: `Run "list-bindings ${alias}" to see current bindings.`,
        },
      };
    }
    return {
      success: true,
      message: `Unbound ${alias}/${bindingName}`,
      exitCode: 0,
    };
  } catch (err) {
    return station.failure(err);
  }
}
