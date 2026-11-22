/**
 * @agentapps/cli — `completions install` and `completions uninstall`.
 *
 * The completion script is written to a fixed file under `~/.agentapps` and
 * the shell's rc file gets one guarded line that sources it. The line never
 * runs the CLI, so a new shell does not start Node, does not depend on where
 * in the rc file the PATH is set up, and stays quiet once the file is gone.
 *
 * @spec CLI-REQ-10
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { bashCompletionScript, zshCompletionScript } from './completions.js';

export type CompletionShell = 'bash' | 'zsh';

const COMMENT = '# agentapps shell completions';

/** The shell named on the command line, or the user's login shell. @spec CLI-REQ-10 */
export function completionShell(
  given: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): CompletionShell | undefined {
  const name = given ?? basename(env.SHELL ?? '');
  return name === 'bash' || name === 'zsh' ? name : undefined;
}

function paths(shell: CompletionShell, env: NodeJS.ProcessEnv) {
  const home = env.HOME ?? homedir();
  const rcFile =
    shell === 'zsh'
      ? join(env.ZDOTDIR ?? home, '.zshrc')
      : // macOS opens login shells, which read .bash_profile; Linux reads .bashrc.
        join(home, process.platform === 'darwin' ? '.bash_profile' : '.bashrc');
  const name = `completions.${shell}`;
  return {
    file: join(home, '.agentapps', name),
    rcFile,
    line: `[ -f "$HOME/.agentapps/${name}" ] && source "$HOME/.agentapps/${name}"`,
  };
}

/**
 * The rc file without anything this CLI or the repository installer wrote for
 * completions: the sourcing line, the older `eval "$(agentapps completions …)"`
 * lines, and the comment above them.
 */
function withoutCompletions(rc: string, line: string): string {
  const kept: string[] = [];
  for (const current of rc.split('\n')) {
    if (current === line || current.includes('agentapps completions ')) {
      if (kept.at(-1) === COMMENT) kept.pop();
      if (kept.at(-1) === '') kept.pop();
      continue;
    }
    kept.push(current);
  }
  return kept.join('\n');
}

/** @spec CLI-REQ-10 */
export function installCompletions(
  shell: CompletionShell,
  env: NodeJS.ProcessEnv = process.env,
): { file: string; rcFile: string } {
  const { file, rcFile, line } = paths(shell, env);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, shell === 'zsh' ? zshCompletionScript() : bashCompletionScript(), 'utf8');

  const rc = existsSync(rcFile) ? readFileSync(rcFile, 'utf8') : '';
  const base = withoutCompletions(rc, line).replace(/\n+$/, '');
  writeFileSync(rcFile, `${base ? `${base}\n\n` : ''}${COMMENT}\n${line}\n`, 'utf8');
  return { file, rcFile };
}

/** @spec CLI-REQ-10 */
export function uninstallCompletions(
  shell: CompletionShell,
  env: NodeJS.ProcessEnv = process.env,
): { file: string; rcFile: string } {
  const { file, rcFile, line } = paths(shell, env);
  rmSync(file, { force: true });
  if (existsSync(rcFile)) {
    const rc = readFileSync(rcFile, 'utf8');
    const cleaned = withoutCompletions(rc, line);
    if (cleaned !== rc) writeFileSync(rcFile, cleaned, 'utf8');
  }
  return { file, rcFile };
}
