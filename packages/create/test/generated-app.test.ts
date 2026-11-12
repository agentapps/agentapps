/**
 * Generates an app from every template and runs what an author would run on it:
 * its own vitest suite, the TypeScript compiler (src and tests) and the validator.
 *
 * Apps are generated in repo mode under packages/create/.gen/ (gitignored) so they
 * resolve @agentapps/* from this workspace. Needs `pnpm build` first, like CI does.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findRepoRoot, type ScaffoldOptions, scaffoldApp } from '../src/scaffold.js';
import { validate } from '../src/validate.js';

const require = createRequire(import.meta.url);
const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEN_ROOT = join(PACKAGE_DIR, '.gen');
const VITEST = require.resolve('vitest/vitest.mjs');
const TSC = require.resolve('typescript/bin/tsc');

const CASES: Array<{
  id: string;
  template: 'api' | 'minimal' | 'full';
  options?: Partial<ScaffoldOptions>;
}> = [
  { id: 'gen-api-key', template: 'api', options: { auth: 'api-key', secrets: ['GEN_API_KEY'] } },
  {
    id: 'gen-api-system',
    template: 'api',
    options: { auth: 'api-key', secrets: ['GEN_TOKEN'], systemSecrets: ['GEN_APP_ID'] },
  },
  {
    id: 'gen-oauth2',
    template: 'api',
    options: {
      appId: 'app.gen.oauth-two',
      auth: 'oauth2',
      provider: 'google',
      scopes: ['https://www.googleapis.com/auth/userinfo.email'],
    },
  },
  { id: 'gen-api-open', template: 'api' },
  { id: 'gen-minimal', template: 'minimal' },
  { id: 'gen-full', template: 'full' },
];

let genDir: string;

beforeAll(() => {
  mkdirSync(GEN_ROOT, { recursive: true });
  genDir = mkdtempSync(join(GEN_ROOT, 'run-'));
});

afterAll(() => {
  rmSync(genDir, { recursive: true, force: true });
});

function run(file: string, args: string[], cwd: string): string {
  try {
    return execFileSync(process.execPath, [file, ...args], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    throw new Error(`${file} ${args.join(' ')} failed:\n${e.stdout ?? ''}\n${e.stderr ?? ''}`);
  }
}

describe.each(CASES)('generated $template app ($id)', (c) => {
  let dir: string;

  beforeAll(async () => {
    const result = await scaffoldApp({
      projectName: c.id,
      template: c.template,
      ...c.options,
      mode: 'repo',
      cwd: PACKAGE_DIR,
      destDir: join(genDir, c.id),
      register: false,
      skipInstall: true,
      skipGit: true,
    });
    dir = result.destDir;
  }, 30_000);

  it('passes its own tests', () => {
    // Without its own config, vitest would walk up and pick the repo's root config.
    writeFileSync(
      join(dir, 'vitest.config.mjs'),
      "export default { test: { include: ['test/**/*.test.ts'] } };\n",
    );
    const out = run(VITEST, ['run', '--root', dir, '--config', 'vitest.config.mjs'], dir);
    expect(out).toMatch(/passed/);
  }, 60_000);

  it('type-checks, tests included', () => {
    run(TSC, ['--noEmit', '-p', dir], dir);
    run(TSC, ['-p', join(dir, 'test')], dir);
  }, 60_000);

  it('passes check-app with only TODO warnings', async () => {
    const result = await validate({ cwd: dir });
    expect(result.errors).toEqual([]);
    for (const w of result.warnings) expect(w).toMatch(/TODO/);
  });
});

describe('standalone output', () => {
  const root = findRepoRoot(PACKAGE_DIR);
  const biome = root ? join(root, 'node_modules', '.bin', 'biome') : '';
  let outside: string;

  beforeAll(() => {
    outside = mkdtempSync(join(tmpdir(), 'create-standalone-'));
  });

  afterAll(() => {
    rmSync(outside, { recursive: true, force: true });
  });

  it.skipIf(!existsSync(biome)).each(CASES)(
    'passes its own biome config ($template, $id)',
    async (c) => {
      const result = await scaffoldApp({
        projectName: c.id,
        template: c.template,
        ...c.options,
        mode: 'standalone',
        cwd: outside,
        skipInstall: true,
        skipGit: true,
      });
      const out = execFileSync(biome, ['check', '--vcs-enabled=false', '.'], {
        cwd: result.destDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      expect(out).toMatch(/Checked \d+ files/);
    },
    30_000,
  );
});
