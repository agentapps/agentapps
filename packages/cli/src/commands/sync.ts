/**
 * @agentapps/cli — sync command.
 *
 * Installs the `npm:` app packages referenced in `agentapps.json` into the
 * CLI-managed app store (`.agentapps/apps/`). It only ever installs apps already
 * referenced in the config (the allowlist) — it never adds new ones. Path
 * sources are left as-is.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readRawConfig } from '../config.js';
import { stateDir } from '../state.js';
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

function npmInstall(cwd: string, specs: string[], output: NodeJS.WritableStream): Promise<number> {
  return new Promise((res) => {
    const child = spawn('npm', ['install', '--no-audit', '--no-fund', '--save', ...specs], {
      cwd,
      stdio: ['ignore', output === process.stdout ? 'inherit' : 'pipe', 'inherit'],
    });
    child.on('error', () => res(-1));
    child.on('close', (code) => res(code ?? 1));
  });
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

  // CLI-managed app store: an isolated node project under .agentapps/apps/.
  const store = resolve(stateDir(ctx.configPath), 'apps');
  mkdirSync(store, { recursive: true });
  const storePkg = resolve(store, 'package.json');
  if (!existsSync(storePkg)) {
    writeFileSync(
      storePkg,
      `${JSON.stringify({ name: 'agentapps-apps', private: true, version: '0.0.0' }, null, 2)}\n`,
      'utf8',
    );
  }

  output.write(`Syncing ${specs.length} app package(s) into ${store}\n`);
  const code = await npmInstall(store, specs, output);
  if (code === -1) {
    return {
      success: false,
      exitCode: 1,
      error: {
        message: 'Could not run npm. Is it installed and on your PATH?',
      },
    };
  }
  if (code !== 0) {
    return {
      success: false,
      exitCode: 1,
      error: { message: `npm install failed (exit ${code}).` },
    };
  }

  return {
    success: true,
    message: `Synced ${specs.length} app package${specs.length === 1 ? '' : 's'}.`,
    data: { installed: specs },
    exitCode: 0,
  };
}
