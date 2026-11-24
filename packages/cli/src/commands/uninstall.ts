/**
 * @agentapps/cli — uninstall command.
 */

import { createInterface } from 'node:readline';
import { isResult, stationOf } from '../station-client.js';
import { findInstallation } from '../station-session.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

/** @spec STADMIN-REQ-6 */
export async function handleUninstall(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'uninstall') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected uninstall command' },
    };
  }

  const { alias } = command;
  const { options, input = process.stdin, output = process.stdout } = context;
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    const instance = await findInstallation(station, alias);
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

    if ((instance.setSecrets ?? []).length > 0 && !options.yes) {
      const confirmed = await confirm(
        `This will remove ${alias} and its stored authentication tokens.\nAre you sure? (y/N) `,
        input,
        output,
      );
      if (!confirmed) {
        return { success: true, message: 'Uninstall cancelled.', exitCode: 0 };
      }
    }

    await context.sessions?.release(alias);
    // The Station removes the Installation with its secrets and its Bindings.
    await station.api(
      'DELETE',
      `/api/installations/${encodeURIComponent(instance.installationId)}`,
    );
    return {
      success: true,
      message: `Uninstalled ${alias} (${instance.appId})`,
      exitCode: 0,
    };
  } catch (err) {
    return station.failure(err);
  }
}

function confirm(
  prompt: string,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input, output });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}
