import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packages = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every file under a directory, recursively. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('the CLI runs by its scoped package name', () => {
  it('[CLI-AC-8] cli, agentapps and aa are the same command, and no template or skill says npx agentapps', () => {
    const manifest = JSON.parse(readFileSync(join(packages, 'cli', 'package.json'), 'utf8'));
    expect(manifest.bin.cli).toBe(manifest.bin.agentapps);
    expect(manifest.bin.aa).toBe(manifest.bin.agentapps);

    const offenders = [join(packages, 'create', 'templates'), join(packages, 'create', 'skill')]
      .flatMap(filesUnder)
      .filter((path) => /npx agentapps[ `]/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
