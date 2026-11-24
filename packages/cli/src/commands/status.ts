/**
 * @agentapps/cli — status command.
 */

import { isResult, stationOf } from '../station-client.js';
import { authStatusLabel, findInstallation } from '../station-session.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

/** @spec STADMIN-REQ-6 */
export async function handleStatus(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'status') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected status command' },
    };
  }

  const { alias } = command;
  const station = stationOf(context);
  if (isResult(station)) return station;

  let instance: Awaited<ReturnType<typeof findInstallation>>;
  try {
    instance = await findInstallation(station, alias);
  } catch (err) {
    return station.failure(err);
  }
  if (!instance) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Unknown alias: ${alias}`,
        suggestion: 'Run "installations" to see installed apps.',
      },
    };
  }

  const auth = instance.auth;
  const status: Record<string, ResultValue | undefined> = {
    App: instance.appId,
    Status: authStatusLabel(auth),
    Auth: !auth || auth.kind === 'none' ? undefined : auth.kind,
    Provider: auth?.provider,
    Scopes: auth?.scopes?.join(', '),
    Expires: auth?.expiresAt,
    Missing: auth?.missingSecrets?.length ? auth.missingSecrets.join(', ') : undefined,
  };

  return {
    success: true,
    data: { [`Installation: ${alias}`]: status } as unknown as ResultValue,
    exitCode: 0,
  };
}
