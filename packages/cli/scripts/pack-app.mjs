#!/usr/bin/env node
/**
 * Packs an app for release as a self-contained npm tarball (DIST-REQ-5): its
 * code and dependencies bundled into `dist/app.js` by Bun, plus `agentapp.json`,
 * with no runtime dependencies, so the executable can install it by unpacking
 * one file (DIST-REQ-6).
 *
 *   node packages/cli/scripts/pack-app.mjs apps/hello [--out <dir>]
 *
 * Writes `<out>/<name>-<version>.tgz` (default out: packages/cli/dist-apps).
 *
 * @spec DIST-REQ-5
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNTIME_DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const BUILTINS = new Set(builtinModules);

/**
 * Throws unless the package in `pkgDir` is self-contained: no runtime
 * dependencies declared and no imports of other packages in `dist/app.js`.
 */
export function assertSelfContained(pkgDir) {
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    const deps = Object.keys(pkg[field] ?? {});
    if (deps.length > 0) {
      throw new Error(
        `${pkg.name} declares ${field}: ${deps.join(', ')}; app packages must be self-contained`,
      );
    }
  }
  const code = readFileSync(join(pkgDir, 'dist', 'app.js'), 'utf8');
  const patterns = [
    /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*["']([^"'\s]+)["']/gm, // import x from 'y'
    /^\s*import\s*["']([^"'\s]+)["']/gm, // import 'y'
    /\bimport\(\s*["']([^"'\s]+)["']\s*\)/g, // import('y')
  ];
  const imported = patterns.flatMap((p) => [...code.matchAll(p)].map((m) => m[1]));
  const external = imported.filter(
    (s) => !s.startsWith('.') && !s.startsWith('/') && !s.startsWith('node:') && !BUILTINS.has(s),
  );
  if (external.length > 0) {
    throw new Error(
      `${pkg.name} still imports ${[...new Set(external)].join(', ')}; bundle them into dist/app.js`,
    );
  }
}

function run(command, args, options = {}) {
  const r = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (r.error) throw new Error(`${command}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${command} ${args[0]} failed (exit ${r.status})`);
}

/** Pack `appDir` into `outDir`; returns the tarball's path. */
export function packApp(appDir, outDir) {
  const source = resolve(appDir);
  const appPkg = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  const entry = join(source, 'src', 'app.ts');
  if (!existsSync(entry)) throw new Error(`${source} has no src/app.ts`);

  const work = mkdtempSync(join(tmpdir(), 'agentapps-pack-'));
  const pkgDir = join(work, 'package');
  try {
    mkdirSync(join(pkgDir, 'dist'), { recursive: true });
    run('bun', [
      'build',
      entry,
      '--target=node',
      '--format=esm',
      '--outfile',
      join(pkgDir, 'dist', 'app.js'),
    ]);
    copyFileSync(join(source, 'agentapp.json'), join(pkgDir, 'agentapp.json'));
    const pkg = {
      name: appPkg.name,
      version: appPkg.version,
      description: appPkg.description,
      license: appPkg.license,
      type: 'module',
      main: './dist/app.js',
      exports: {
        '.': './dist/app.js',
        './agentapp.json': './agentapp.json',
        './package.json': './package.json',
      },
      ...(appPkg.repository ? { repository: appPkg.repository } : {}),
    };
    writeFileSync(join(pkgDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    assertSelfContained(pkgDir);

    mkdirSync(outDir, { recursive: true });
    const tarball = join(
      outDir,
      `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`,
    );
    // COPYFILE_DISABLE keeps macOS tar from adding ._ metadata files.
    run('tar', ['-czf', tarball, '-C', work, 'package'], {
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });
    return tarball;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outDir = outIndex >= 0 ? resolve(args[outIndex + 1]) : join(cliDir, 'dist-apps');
  const appDir = args.find((a, i) => !a.startsWith('--') && (outIndex < 0 || i !== outIndex + 1));
  if (!appDir) {
    console.error(`Usage: node ${basename(process.argv[1])} <appDir> [--out <dir>]`);
    process.exit(2);
  }
  try {
    console.log(`package: ${packApp(appDir, outDir)}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
