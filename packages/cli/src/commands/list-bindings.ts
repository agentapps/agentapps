/**
 * @agentapps/cli — list-bindings command.
 */

import { isResult, stationOf } from '../station-client.js';
import { findInstallation } from '../station-session.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

/** @spec STADMIN-REQ-6 */
export async function handleListBindings(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'list-bindings') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected list-bindings command' },
    };
  }

  const { alias } = command;
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
    const { bindings } = await station.api<{
      bindings: Array<{ bindingName: string; targetInstallationId: string; boundAt: string }>;
    }>('GET', `/api/installations/${encodeURIComponent(consumer.installationId)}/bindings`);

    if (bindings.length === 0) {
      return {
        success: true,
        message: `No bindings for ${alias}.`,
        exitCode: 0,
      };
    }

    const data: Record<string, ResultValue> = {};
    for (const b of bindings) {
      data[b.bindingName] = {
        target: b.targetInstallationId,
        boundAt: b.boundAt,
      };
    }
    return {
      success: true,
      data: { [`Bindings for ${alias}`]: data } as unknown as ResultValue,
      exitCode: 0,
    };
  } catch (err) {
    return station.failure(err);
  }
}
