#!/usr/bin/env node

/**
 * @agentapps/cli — binary entry point.
 *
 * Usage:
 *   agentapps                          Start the REPL
 *   agentapps <command> [args...]      Execute a single REPL command
 *
 * The package manifest also exposes this file as `cli`, so that `npx @agentapps/cli`
 * finds a command named after the package.
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
  completionShell,
  installCompletions,
  uninstallCompletions,
} from './completions-install.js';
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

/**
 * Handle `completions install|uninstall [shell]` and `completions bash|zsh`,
 * which prints the script.
 *
 * @spec CLI-REQ-10
 */
function handleCompletionsCommand(args: string[]): number {
  const [action, given] = args;
  if (action === 'install' || action === 'uninstall') {
    const shell = completionShell(given);
    if (!shell) {
      console.error(`Completions are available for bash and zsh: completions ${action} <bash|zsh>`);
      return 2;
    }
    if (action === 'install') {
      const { file, rcFile } = installCompletions(shell);
      console.log(`  ✓ Completions for ${shell} written to ${file}`);
      console.log(`  ✓ ${rcFile} loads them; open a new terminal to use them.`);
    } else {
      const { file, rcFile } = uninstallCompletions(shell);
      console.log(`  ✓ Removed ${file} and its line in ${rcFile}.`);
    }
    return 0;
  }
  if (action === 'bash') {
    process.stdout.write(bashCompletionScript());
    return 0;
  }
  if (action === 'zsh') {
    process.stdout.write(zshCompletionScript());
    return 0;
  }
  console.error('Usage: agentapps completions install|uninstall [bash|zsh]');
  console.error('       agentapps completions <bash|zsh>     print the script');
  return 2;
}

/** What to try after a command line the CLI does not understand. @spec CLI-REQ-11 */
const USAGE_HINT =
  'Run "agentapps help" to see the commands, or "agentapps" alone to enter the interactive mode.';

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  try {
    // --- Early flags (before normal arg parsing) ---
    const gcIdx = argv.indexOf('--get-completions');
    if (gcIdx >= 0) {
      return handleGetCompletions(argv[gcIdx + 1] ?? '');
    }

    // DIST-REQ-4, CLI-REQ-11: the version of this build.
    if (
      argv[0] === '--version' ||
      argv[0] === '-V' ||
      (argv[0] === 'version' && argv.length === 1)
    ) {
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

    // CLI-REQ-11: `help` alone is the same as --help.
    const helpCommand = commandTokens.length === 1 && commandTokens[0] === 'help';
    if ((options.help && commandTokens.length === 0) || helpCommand) {
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
            suggestion: USAGE_HINT,
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
    // CLI-REQ-11: an option the CLI does not know says what to run instead.
    if (message.startsWith('Unknown option')) console.error(USAGE_HINT);
    return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
