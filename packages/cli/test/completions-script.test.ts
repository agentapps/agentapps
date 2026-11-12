import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { zshCompletionScript } from '../src/completions.js';

const hasZsh = spawnSync('zsh', ['-fc', 'true']).status === 0;

describe('zshCompletionScript', () => {
  it('loads compinit when compdef is missing', () => {
    expect(zshCompletionScript()).toContain(
      '(( $+functions[compdef] )) || { autoload -Uz compinit && compinit -i; }',
    );
  });

  it.skipIf(!hasZsh)('registers in a zsh without compinit and prints nothing on stderr', () => {
    // A zsh with no rc files, like stock macOS where compinit never runs.
    const home = mkdtempSync(join(tmpdir(), 'agentapps-zsh-'));
    try {
      const result = spawnSync(
        'zsh',
        ['-f', '-c', `${zshCompletionScript()}\nprint -r -- "\${_comps[agentapps]}"`],
        { env: { PATH: process.env.PATH, HOME: home, ZDOTDIR: home }, encoding: 'utf8' },
      );
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toBe('_agentapps');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
