/**
 * @agentapps/cli — bind command.
 *
 * Fulfils a requirement of one Installation with another.
 */

import { isResult, stationOf } from '../station-client.js';
import { findInstallation } from '../station-session.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

function unknown(what: string, alias: string): HandlerResult {
  return {
    success: false,
    exitCode: 2,
    error: {
      message: `Unknown ${what}: ${alias}`,
      suggestion: 'Run "installations" to see installed apps.',
    },
  };
}

/** @spec STADMIN-REQ-6 */
export async function handleBind(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'bind') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected bind command' },
    };
  }

  const { alias, bindingName, targetAlias } = command;
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    const consumer = await findInstallation(station, alias);
    if (!consumer) return unknown('Installation', alias);
    const target = await findInstallation(station, targetAlias);
    if (!target) return unknown('target Installation', targetAlias);
    if (alias === targetAlias) {
      return {
        success: false,
        exitCode: 2,
        error: { message: 'Cannot bind an app to itself.' },
      };
    }
    await station.api(
      'PUT',
      `/api/installations/${encodeURIComponent(consumer.installationId)}/bindings/${encodeURIComponent(bindingName)}`,
      { target: target.installationId },
    );
    return {
      success: true,
      message: `Bound ${alias}/${bindingName} → ${targetAlias} (${target.appId})`,
      exitCode: 0,
    };
  } catch (err) {
    return station.failure(err);
  }
}
