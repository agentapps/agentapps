/**
 * @agentapps/cli — rename command.
 */

import { renameInstallation } from '../state.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

export async function handleRename(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'rename') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected rename command' },
    };
  }

  const { alias, newAlias } = command;
  const { ctx } = context;

  // A pooled session is keyed by alias — close it so the old key can't leak.
  await context.sessions?.release(alias);

  try {
    renameInstallation(ctx.configPath, alias, newAlias);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      exitCode: 2,
      error: { message },
    };
  }

  return {
    success: true,
    message: `Renamed ${alias} → ${newAlias}`,
    exitCode: 0,
  };
}
