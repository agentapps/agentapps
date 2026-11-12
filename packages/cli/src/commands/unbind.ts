/**
 * @agentapps/cli — unbind command.
 *
 * Usage: unbind <alias> <requirement>
 *
 * Removes a binding from a consumer app's named requirement.
 */

import { getInstallation, removeBinding } from '../state.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

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
  const { ctx } = context;

  const consumer = getInstallation(ctx.configPath, alias);
  if (!consumer) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Unknown instance: ${alias}`,
        suggestion: 'Run "installations" to see installed apps.',
      },
    };
  }

  // Bindings are keyed by installationId, so remove by the resolved id.
  const removed = removeBinding(ctx.configPath, consumer.installationId, bindingName);
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
}
