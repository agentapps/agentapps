/**
 * @agentapps/cli — installations command.
 *
 * Lists the Installations of the caller's Workspace, as the Station has them.
 */

import { isResult, stationOf } from '../station-client.js';
import { authStatusLabel, listInstallations } from '../station-session.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

/** @spec STADMIN-REQ-6 */
export async function handleList(
  _command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
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
      message: 'No apps installed.',
      data: { hint: 'Install one with: install <app-id> <alias>' },
      exitCode: 0,
    };
  }

  return {
    success: true,
    data: instances.map((instance) => ({
      Alias: instance.alias,
      'App ID': instance.appId,
      Status: authStatusLabel(instance.auth),
    })),
    message: `${instances.length} Installation${instances.length === 1 ? '' : 's'}`,
    exitCode: 0,
  };
}
