/**
 * @agentapps/cli — list command.
 *
 * Lists installed apps with their auth status, resolved through the
 * shared auth helper (manifest auth declaration + stored tokens/secrets).
 */

import { authStatusLabel, getAuthInfo } from '../auth-helper.js';
import { loadInstallations } from '../state.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

export async function handleList(
  _command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  const { ctx } = context;
  const instances = loadInstallations(ctx.configPath);

  if (instances.length === 0) {
    return {
      success: true,
      message: 'No apps installed.',
      data: { hint: 'Install one with: install <app-id> <alias>' },
      exitCode: 0,
    };
  }

  const rows = await Promise.all(
    instances.map(async (instance) => {
      const status = await getAuthInfo(instance.installationId, instance.appId, ctx);
      return {
        Alias: instance.alias,
        'App ID': instance.appId,
        Status: authStatusLabel(status),
      };
    }),
  );

  return {
    success: true,
    data: rows,
    message: `${instances.length} instance${instances.length === 1 ? '' : 's'} installed`,
    exitCode: 0,
  };
}
