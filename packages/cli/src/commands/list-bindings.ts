/**
 * @agentapps/cli — list-bindings command.
 *
 * Usage: list-bindings <alias>
 *
 * Shows all intent bindings for a given consumer app.
 */

import { getBindingsForInstallation, getInstallation } from '../state.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

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
  const { ctx } = context;

  const consumer = getInstallation(ctx.configPath, alias);
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

  const bindings = getBindingsForInstallation(ctx.configPath, consumer.installationId);

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
}
