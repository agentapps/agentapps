/**
 * @agentapps/cli — bind command.
 *
 * Usage: bind <alias> <requirement> <target-alias>
 *
 * Creates or updates a binding that maps a consumer app's named requirement
 * to a specific target installation.
 */

import { addBinding, getInstallation } from '../state.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

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

  const target = getInstallation(ctx.configPath, targetAlias);
  if (!target) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Unknown target Installation: ${targetAlias}`,
        suggestion: 'Run "installations" to see installed apps.',
      },
    };
  }

  if (alias === targetAlias) {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Cannot bind an app to itself.' },
    };
  }

  // Bindings are keyed by installationId (see getBindingsForInstallation /
  // list-bindings), so resolve both aliases before storing.
  addBinding(ctx.configPath, consumer.installationId, bindingName, target.installationId);

  return {
    success: true,
    message: `Bound ${alias}/${bindingName} → ${targetAlias} (${target.appId})`,
    exitCode: 0,
  };
}
