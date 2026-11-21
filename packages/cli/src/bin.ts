#!/usr/bin/env node

/**
 * @agentapps/cli — binary entry point.
 *
 * Usage:
 *   agentapps                          Start the REPL
 *   agentapps <command> [args...]      Execute a single REPL command
 *
 * The package manifest also exposes this file as `aa` and as `cli`, the latter so that
 * `npx @agentapps/cli` finds a command named after the package.
 *
 * @spec CLI-REQ-8
 */

process.on('unhandledRejection', (reason) => {
  console.error('[agentapps] unhandled rejection:', reason);
});

import { resolve } from 'node:path';
import { parseGlobalArgs } from './args.js';
import { buildVersion } from './build-info.js';
import { bashCompletionScript, zshCompletionScript } from './completions.js';
import {
  ensureHomeWorkspace,
  findConfigPath,
  getDefaultCwd,
  loadWorkspaceConfig,
  rememberWorkspace,
  saveGlobalWorkspace,
} from './config.js';
import { dispatchCommand } from './dispatch.js';
import { printHelp } from './help.js';
import { createRenderer } from './render/index.js';
import { getCompletions, parseReplTokens } from './repl-parser.js';
import type { CliContext, WorkspaceConfig } from './types.js';

/** Handle `--get-completions "<partial>"` — shell completion request. */
function handleGetCompletions(partial: string): number {
  try {
    const cwd = getDefaultCwd();
    const configPath = findConfigPath(cwd);

    let config: WorkspaceConfig = { apps: {} };
    if (configPath) {
      try {
        config = loadWorkspaceConfig(configPath);
      } catch {
        // Graceful: config may be invalid, still suggest static commands.
      }
    }

    const completions = getCompletions(partial, {
      configPath: configPath ?? '',
      config,
      aliases: [],
    });
    for (const c of completions) {
      process.stdout.write(`${c}\n`);
    }
  } catch {
    // Completions are best-effort — never fail noisily.
  }
  return 0;
}

/** Handle `completions bash|zsh` — print the shell completion script. */
function handleCompletionsCommand(args: string[]): number {
  const shell = args[0];
  if (shell === 'bash') {
    process.stdout.write(bashCompletionScript());
    return 0;
  }
  if (shell === 'zsh') {
    process.stdout.write(zshCompletionScript());
    return 0;
  }
  console.error('Usage: agentapps completions <bash|zsh>');
  console.error('');
  console.error('  bash   Print bash completion script (eval or append to ~/.bashrc)');
  console.error('  zsh    Print zsh completion script  (eval or append to ~/.zshrc)');
  return 2;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  try {
    // --- Early flags (before normal arg parsing) ---
    const gcIdx = argv.indexOf('--get-completions');
    if (gcIdx >= 0) {
      return handleGetCompletions(argv[gcIdx + 1] ?? '');
    }

    // DIST-REQ-4: the version of this build.
    if (argv[0] === '--version' || argv[0] === '-V') {
      console.log(buildVersion());
      return 0;
    }

    const swIdx = argv.indexOf('--set-workspace');
    if (swIdx >= 0) {
      const wsPath = argv[swIdx + 1];
      if (!wsPath) {
        console.error('Usage: agentapps --set-workspace <path-to-workspace>');
        return 2;
      }
      saveGlobalWorkspace(wsPath);
      console.error(`Workspace saved: ${resolve(wsPath)}`);
      return 0;
    }

    const { options, commandTokens } = parseGlobalArgs(argv);

    if (options.help && commandTokens.length === 0) {
      printHelp();
      return 0;
    }

    // Handle `completions` command early (no workspace config needed).
    if (commandTokens[0] === 'completions') {
      return handleCompletionsCommand(commandTokens.slice(1));
    }

    const cwd = options.cwd ?? getDefaultCwd();
    // DIST-REQ-1: outside any clone or saved workspace, use the home workspace.
    const configPath = options.config
      ? resolve(cwd, options.config)
      : (findConfigPath(cwd) ?? ensureHomeWorkspace());

    rememberWorkspace(configPath, options.config !== undefined);

    const config = loadWorkspaceConfig(configPath);
    const ctx: CliContext = { cwd, config, configPath };

    const renderer = createRenderer({
      isTTY: process.stdout.isTTY ?? false,
      noColor: process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '',
      format: options.json ? 'json' : options.yaml ? 'yaml' : options.raw ? 'raw' : 'human',
      width: process.stdout.columns,
    });

    // REPL mode: no command tokens.
    if (commandTokens.length === 0) {
      // Loaded only for the REPL: the single executable's runtime may lack node:repl.
      const { startRepl } = await import('./repl.js');
      await startRepl({ ctx, options });
      return 0;
    }

    // One-shot mode: use pre-tokenized argv directly (preserves shell quoting).
    const command = parseReplTokens(commandTokens, { configPath, config, aliases: [] });

    if (command.type === 'unknown') {
      console.log(
        renderer.render({
          success: false,
          error: {
            message: command.token ? `Unknown command: ${command.token}` : 'Empty command',
            suggestion: 'Run "agentapps --help" to see available commands.',
          },
        }),
      );
      return 2;
    }

    const result = await dispatchCommand(command, { ctx, options });
    const rendered = renderer.render(result);
    if (rendered) {
      console.log(rendered);
    }
    return result.exitCode;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
