/**
 * `completions install` and `completions uninstall` (CLI-REQ-10).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  completionShell,
  installCompletions,
  uninstallCompletions,
} from '../src/completions-install.js';

const hasZsh = spawnSync('zsh', ['-fc', 'true']).status === 0;
const LINE =
  '[ -f "$HOME/.agentapps/completions.zsh" ] && source "$HOME/.agentapps/completions.zsh"';

let home: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'agentapps-completions-'));
  env = { HOME: home, SHELL: '/bin/zsh' };
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const rc = () => readFileSync(join(home, '.zshrc'), 'utf8');

describe('completions install', () => {
  it('[CLI-AC-10] writes the script, adds one guarded line, replaces an older eval line, and uninstalls cleanly', () => {
    // What an earlier installer left: an eval that runs the CLI in every new shell.
    writeFileSync(
      join(home, '.zshrc'),
      'export EDITOR=vim\n\n# agentapps shell completions\neval "$(agentapps completions zsh)"\n\nalias ll="ls -l"\n',
    );
    expect(completionShell(undefined, env)).toBe('zsh');
    expect(completionShell(undefined, { SHELL: '/usr/bin/fish' })).toBeUndefined();

    const { file } = installCompletions('zsh', env);
    expect(file).toBe(join(home, '.agentapps', 'completions.zsh'));
    expect(readFileSync(file, 'utf8')).toContain('compdef _agentapps agentapps');
    const installed = rc();
    expect(installed).not.toContain('eval "$(agentapps');
    expect(installed.split('\n').filter((l) => l === LINE)).toHaveLength(1);
    expect(installed).toContain('export EDITOR=vim');
    expect(installed).toContain('alias ll="ls -l"');

    // Running it again changes nothing.
    installCompletions('zsh', env);
    expect(rc()).toBe(installed);

    uninstallCompletions('zsh', env);
    expect(existsSync(file)).toBe(false);
    expect(rc()).toBe('export EDITOR=vim\n\nalias ll="ls -l"\n');
  });

  it.skipIf(!hasZsh)(
    '[CLI-AC-10] a new zsh loads the completion without agentapps on the PATH, and stays quiet after an uninstall',
    () => {
      installCompletions('zsh', env);
      // -c does not read .zshrc, so source it the way an interactive shell would. No
      // agentapps and no node on this PATH: the rc line must not need them.
      const interactive = (script: string) =>
        spawnSync('zsh', ['-c', `source "$HOME/.zshrc"\n${script}`], {
          env: { PATH: '/usr/bin:/bin', HOME: home, ZDOTDIR: home },
          encoding: 'utf8',
        });
      const loaded = interactive('print -r -- "${_comps[agentapps]}"');
      expect(loaded.stderr).toBe('');
      expect(loaded.stdout.trim()).toBe('_agentapps');

      // The file is gone but the line is still there: nothing is printed.
      rmSync(join(home, '.agentapps', 'completions.zsh'));
      const quiet = interactive('print done');
      expect(quiet.stderr).toBe('');
      expect(quiet.stdout.trim()).toBe('done');
    },
  );
});
