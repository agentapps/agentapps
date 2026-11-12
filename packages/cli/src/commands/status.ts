/**
 * @agentapps/cli — status command.
 */

import { authStatusLabel, getAuthInfo } from '../auth-helper.js';
import { getInstallation } from '../state.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

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
  const { ctx } = context;
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

  const auth = await getAuthInfo(instance.installationId, instance.appId, ctx);

  const status: Record<string, ResultValue | undefined> = {
    App: instance.appId,
    Status: authStatusLabel(auth),
    Auth: auth.kind === 'none' ? undefined : auth.kind,
    Provider: auth.provider,
    Scopes: auth.scopes?.join(', '),
    Expires: auth.expiresAt,
    Missing: auth.missingSecrets?.length ? auth.missingSecrets.join(', ') : undefined,
  };

  return {
    success: true,
    data: { [`Instance: ${alias}`]: status } as unknown as ResultValue,
    exitCode: 0,
  };
}
