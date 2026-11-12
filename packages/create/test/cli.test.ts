/**
 * Tests for CLI argument parsing and validation.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateProjectName } from '../src/scaffold.js';

describe('validateProjectName', () => {
  it('accepts valid kebab-case names', () => {
    expect(validateProjectName('my-app')).toBeNull();
    expect(validateProjectName('hello-world')).toBeNull();
    expect(validateProjectName('app123')).toBeNull();
  });

  it('rejects empty names', () => {
    expect(validateProjectName('')).toBe('Project name is required');
  });

  it('rejects names starting with numbers', () => {
    expect(validateProjectName('123-app')).not.toBeNull();
  });

  it('rejects names with uppercase letters', () => {
    expect(validateProjectName('MyApp')).not.toBeNull();
  });

  it('rejects names with special characters', () => {
    expect(validateProjectName('my_app')).not.toBeNull();
    expect(validateProjectName('my app')).not.toBeNull();
    expect(validateProjectName('my@app')).not.toBeNull();
  });

  it('rejects names longer than 50 characters', () => {
    expect(validateProjectName('a'.repeat(51))).not.toBeNull();
  });

  it('accepts names up to 50 characters', () => {
    expect(validateProjectName('a'.repeat(50))).toBeNull();
  });
});

describe('built CLI', () => {
  const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
  let tmpDir: string;

  beforeEach(() => {
    // Under packages/create/.gen so a scaffolded app resolves @agentapps/* when check-app loads it.
    const gen = join(dirname(fileURLToPath(import.meta.url)), '..', '.gen');
    mkdirSync(gen, { recursive: true });
    tmpDir = mkdtempSync(join(gen, 'cli-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const run = (file: string, args: string[]) =>
    spawnSync(process.execPath, [file, ...args], { cwd: tmpDir, encoding: 'utf-8' });

  it.skipIf(!existsSync(cli))('scaffolds a standalone app that passes check-app', () => {
    const created = run(cli, ['demo', '--standalone', '--skip-install', '--skip-git']);
    expect(created.status, created.stderr).toBe(0);
    const checked = run(cli, ['check-app', join(tmpDir, 'demo')]);
    expect(checked.status, checked.stderr).toBe(0);
    expect(checked.stdout).toContain('Validation passed');
  });

  it.skipIf(!existsSync(cli))('exits non-zero when check-app finds errors', () => {
    const checked = run(cli, ['check-app', tmpDir]);
    expect(checked.status).toBe(1);
    expect(checked.stderr).toContain('Missing package.json');
  });

  it.skipIf(!existsSync(cli) || process.platform === 'win32')(
    'runs check-app when invoked as agentapps-check-app',
    () => {
      const bin = join(tmpDir, 'agentapps-check-app');
      symlinkSync(join(dirname(cli), 'bin', 'check-app.js'), bin);
      const checked = run(bin, []);
      expect(checked.status).toBe(1);
      expect(checked.stderr).toContain('Missing package.json');
    },
  );
});

/**
 * pnpm (and npm on Windows) install bins as shims that run `node <target> "$@"`, so the
 * process never sees the bin's name. These tests launch every bin and the generated
 * scripts that way.
 */
describe('CLI launched through a package-manager shim', () => {
  const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const bins: Record<string, string> = JSON.parse(
    readFileSync(join(pkgDir, 'package.json'), 'utf-8'),
  ).bin;
  const built = existsSync(join(pkgDir, 'dist', 'cli.js'));
  let tmpDir: string;

  beforeEach(() => {
    const gen = join(pkgDir, '.gen');
    mkdirSync(gen, { recursive: true });
    tmpDir = mkdtempSync(join(gen, 'shim-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Runs a bin the way pnpm's .bin shim does: exec node <target> "$@". */
  const viaShim = (bin: string, args: string[], cwd = tmpDir) =>
    spawnSync('sh', ['-c', 'exec node "$@"', 'sh', join(pkgDir, bins[bin]), ...args], {
      cwd,
      encoding: 'utf-8',
    });

  it
    .skipIf(!built || process.platform === 'win32')
    .each(['agentapps-check-app', 'agentapps-validate'])(
    '%s runs check-app (and fails on an empty folder)',
    (bin) => {
      const result = viaShim(bin, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Missing package.json');
    },
  );

  it.skipIf(!built || process.platform === 'win32')(
    "a generated project's check script runs check-app under a shim",
    () => {
      const created = viaShim('create-agent-app', [
        'demo',
        '--standalone',
        '--skip-install',
        '--skip-git',
      ]);
      expect(created.status, created.stderr).toBe(0);
      const project = join(tmpDir, 'demo');
      const script: string = JSON.parse(readFileSync(join(project, 'package.json'), 'utf-8'))
        .scripts.check;
      const [bin, ...args] = script.split(' ');
      expect(bins[bin], `script uses unknown bin ${bin}`).toBeDefined();
      const ok = viaShim(bin, args, project);
      expect(ok.status, ok.stderr).toBe(0);
      expect(ok.stdout).toContain('Validation passed');

      // And it fails for a broken app instead of printing help.
      const appTs = join(project, 'src', 'tools', 'get-example.ts');
      writeFileSync(appTs, readFileSync(appTs, 'utf-8').replace('sensitive: false,', ''));
      const broken = viaShim(bin, args, project);
      expect(broken.status).toBe(1);
      expect(broken.stderr).toContain("Tool 'get-example' does not declare sensitive");
    },
  );

  it.skipIf(!built)('exits non-zero when given no command and no arguments', () => {
    const result = spawnSync(process.execPath, [join(pkgDir, bins['create-agent-app'])], {
      cwd: tmpDir,
      encoding: 'utf-8',
      input: '',
    });
    expect(result.status).not.toBe(0);
  });

  it.skipIf(!built)('fails with a clear message when the app calls process.exit at import', () => {
    const created = viaShim('create-agent-app', [
      'quitter',
      '--template',
      'minimal',
      '--standalone',
      '--skip-install',
      '--skip-git',
    ]);
    expect(created.status, created.stderr).toBe(0);
    const project = join(tmpDir, 'quitter');
    const appTs = join(project, 'src', 'app.ts');
    writeFileSync(appTs, `process.exit(0);\n${readFileSync(appTs, 'utf-8')}`);
    const result = viaShim('create-agent-app', ['check-app', project]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('process.exit');
  });

  it.skipIf(!built)(
    'fails with a clear message when the app never finishes loading',
    () => {
      const created = viaShim('create-agent-app', [
        'hanger',
        '--template',
        'minimal',
        '--standalone',
        '--skip-install',
        '--skip-git',
      ]);
      expect(created.status, created.stderr).toBe(0);
      const project = join(tmpDir, 'hanger');
      const appTs = join(project, 'src', 'app.ts');
      writeFileSync(appTs, `await new Promise(() => {});\n${readFileSync(appTs, 'utf-8')}`);
      const result = viaShim('create-agent-app', ['check-app', project, '--load-timeout', '2']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('did not finish loading');
    },
    30_000,
  );
});
