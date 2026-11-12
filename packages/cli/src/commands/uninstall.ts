/**
 * @agentapps/cli — uninstall command.
 */

import { createInterface } from 'node:readline';
import {
  getInstallation,
  hasInstallationSecrets,
  removeAllBindingsForInstallation,
  removeAllPermissionsForInstallation,
  removeInstallation,
} from '../state.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

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
  const { ctx, options, input = process.stdin, output = process.stdout } = context;
  const instance = getInstallation(ctx.configPath, alias);

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

  if (hasInstallationSecrets(ctx.configPath, instance.installationId) && !options.yes) {
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
  removeAllBindingsForInstallation(ctx.configPath, instance.installationId);
  removeAllPermissionsForInstallation(ctx.configPath, instance.installationId);
  removeInstallation(ctx.configPath, alias);
  return {
    success: true,
    message: `Uninstalled ${alias} (${instance.appId})`,
    exitCode: 0,
  };
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
