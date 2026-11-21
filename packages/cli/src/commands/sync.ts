/**
 * @agentapps/cli — sync command.
 *
 * Downloads the `npm:` app packages referenced in `agentapps.json` into the
 * CLI-managed app store (`.agentapps/apps/`), without running npm (DIST-REQ-6). It only ever installs apps already
 * referenced in the config (the allowlist) — it never adds new ones. Path
 * sources are left as-is.
 */

import { appStoreDir, downloadAppPackages } from '../app-store.js';
import { readRawConfig } from '../config.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

/** Read the raw `npm:` specs from agentapps.json (bypasses manifest resolution). */
function readNpmSources(configPath: string): string[] {
  const parsed = readRawConfig(configPath) as { apps?: unknown };
  if (!Array.isArray(parsed.apps)) return [];
  const specs: string[] = [];
  for (const entry of parsed.apps) {
    const source = (entry as { source?: unknown })?.source;
    if (typeof source === 'string' && source.startsWith('npm:')) {
      specs.push(source.slice('npm:'.length));
    }
  }
  return specs;
}

export async function handleSync(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'sync') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected sync command' },
    };
  }

  const { ctx, output = process.stdout } = context;
  const specs = [...new Set(readNpmSources(ctx.configPath))];

  if (specs.length === 0) {
    return {
      success: true,
      message: 'No npm-sourced apps in agentapps.json — nothing to sync.',
      exitCode: 0,
    };
  }

  const store = appStoreDir(ctx.configPath);
  output.write(`Syncing ${specs.length} app package(s) into ${store}\n`);
  const { code, stderr } = await downloadAppPackages(ctx.configPath, specs, output);
  if (code !== 0) {
    return {
      success: false,
      exitCode: 1,
      error: { message: `Sync failed: ${stderr.replace(/^ERR /, '')}` },
    };
  }

  return {
    success: true,
    message: `Synced ${specs.length} app package${specs.length === 1 ? '' : 's'}.`,
    data: { installed: specs },
    exitCode: 0,
  };
}
