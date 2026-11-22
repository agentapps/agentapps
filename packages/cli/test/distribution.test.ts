/**
 * Using agentapps without the repository (DIST-REQ-1..6): the real CLI, and
 * the single executable, run with a temporary home from a directory that has
 * no agentapps.json; a local HTTP server answers like the npm registry.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..');
const BIN = join(CLI, 'src', 'bin.ts');
const HELLO = resolve(CLI, '../../apps/hello');
/** The sample app's version, which the catalog pins. */
const HELLO_VERSION = (
  JSON.parse(readFileSync(join(HELLO, 'package.json'), 'utf8')) as { version: string }
).version;
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;
const hasBun = spawnSync('bun', ['--version']).status === 0;
const PLATFORM = `${process.platform}-${process.arch}`;
const EXECUTABLE = join(CLI, 'dist-bin', `agentapps-${PLATFORM}`);

let root: string;
let home: string;
let cwd: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentapps-dist-'));
  home = join(root, 'home');
  cwd = join(root, 'elsewhere');
  mkdirSync(home);
  mkdirSync(cwd);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

interface Run {
  code: number | null;
  out: string;
}

/** Run a command as a user would, without blocking the test's registry server. */
function exec(command: string, args: string[], env: NodeJS.ProcessEnv, dir = cwd): Promise<Run> {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: dir, env });
    let out = '';
    child.stdout.on('data', (c: Buffer) => {
      out += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      out += c.toString();
    });
    child.on('close', (code) => done({ code, out }));
  });
}

/** `agentapps <args>` from source, under Node. */
function agentapps(args: string[], extraEnv: NodeJS.ProcessEnv = {}, dir = cwd): Promise<Run> {
  // pnpm's NODE_PATH would let Node find the monorepo's own app packages.
  const env = { ...process.env, NODE_PATH: '', HOME: home, NO_COLOR: '1', ...extraEnv };
  return exec(process.execPath, ['--import', TSX, BIN, ...args], env, dir);
}

/** The single executable, with a PATH that has no `node`. */
function executable(args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<Run> {
  return exec(EXECUTABLE, args, { HOME: home, PATH: '/usr/bin:/bin', NO_COLOR: '1', ...extraEnv });
}

const homeConfig = () => join(home, '.agentapps', 'workspace', 'agentapps.json');

/** Tar `pkgDir` (a folder named `package`) into a .tgz and return its bytes. */
function tarball(pkgDir: string): Buffer {
  const out = join(root, `${Date.now()}.tgz`);
  const r = spawnSync('tar', ['-czf', out, '-C', dirname(pkgDir), 'package'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
  return readFileSync(out);
}

/** A hello package that loads the app from source; works only under the tsx loader. */
function sourceHelloTarball(id = 'app.hello'): Buffer {
  const pkg = join(root, 'src-pkg', 'package');
  mkdirSync(join(pkg, 'dist'), { recursive: true });
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name: `@agentapps/${id}`, version: HELLO_VERSION, type: 'module' }),
  );
  const manifest = JSON.parse(readFileSync(join(HELLO, 'agentapp.json'), 'utf8'));
  writeFileSync(join(pkg, 'agentapp.json'), JSON.stringify({ ...manifest, id }));
  writeFileSync(
    join(pkg, 'dist', 'app.js'),
    `export { factory } from ${JSON.stringify(pathToFileURL(join(HELLO, 'src', 'app.ts')).href)};\n`,
  );
  return tarball(pkg);
}

/** A local npm registry serving one version of `@agentapps/app.hello`. */
async function registry(
  bytes: Buffer,
  opts: { badHash?: boolean; id?: string } = {},
): Promise<{ url: string; close: () => void }> {
  const id = opts.id ?? 'app.hello';
  const hashed = opts.badHash ? Buffer.from('something else') : bytes;
  const integrity = `sha512-${createHash('sha512').update(hashed).digest('base64')}`;
  const server: Server = createServer((req, res) => {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    if (req.url === `/@agentapps%2f${id}`) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          name: `@agentapps/${id}`,
          'dist-tags': { latest: HELLO_VERSION },
          versions: { [HELLO_VERSION]: { dist: { tarball: `${base}/hello.tgz`, integrity } } },
        }),
      );
    } else if (req.url === '/hello.tgz') {
      res.end(bytes);
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => server.close(),
  };
}

describe('agentapps without the repository (step 1)', () => {
  it('[DIST-AC-1] outside a workspace it creates and uses the home workspace', async () => {
    const listed = await agentapps(['apps']);
    expect(listed.code).toBe(0);
    expect(listed.out).toContain('app.hello');
    const config = JSON.parse(readFileSync(homeConfig(), 'utf8')) as { apps: { source: string }[] };
    expect(config.apps.map((a) => a.source)).toContain(`npm:@agentapps/app.hello@${HELLO_VERSION}`);

    // Inside a directory with its own agentapps.json, that one wins.
    const own = join(root, 'own');
    mkdirSync(own);
    writeFileSync(join(own, 'agentapps.json'), '{"apps":[]}\n');
    expect((await agentapps(['apps'], {}, own)).out).toContain('No apps configured');
  });

  it('[DIST-AC-2] lists and describes catalog apps before downloading them', async () => {
    expect((await agentapps(['apps', 'hello'])).out).toContain('app.hello');
    const info = await agentapps(['info', 'app.hello']);
    expect(info.code).toBe(0);
    expect(info.out).toContain('Minimal example app with greet and countdown tools');
    expect(existsSync(join(home, '.agentapps', 'workspace', '.agentapps', 'apps'))).toBe(false);
  });

  it('[DIST-AC-3] install downloads the app; a failed download installs nothing', async () => {
    const missing = await registry(Buffer.from('unused'));
    try {
      // The registry has no such version.
      mkdirSync(dirname(homeConfig()), { recursive: true });
      writeFileSync(
        homeConfig(),
        JSON.stringify({ apps: [{ source: 'npm:@agentapps/app.hello@9.9.9' }] }),
      );
      const failed = await agentapps(['install', 'app.hello', 'hello', '-y'], {
        npm_config_registry: missing.url,
      });
      expect(failed.code).not.toBe(0);
      expect(failed.out).toContain('Could not download app.hello');
      expect((await agentapps(['installations'])).out).not.toContain('hello');
    } finally {
      missing.close();
    }

    rmSync(homeConfig());
    const reg = await registry(sourceHelloTarball());
    try {
      const env = { npm_config_registry: reg.url };
      expect((await agentapps(['install', 'app.hello', 'hello', '-y'], env)).code).toBe(0);
      expect((await agentapps(['hello', 'tool', 'greet', 'name:World'], env)).out).toContain(
        'Hello, World!',
      );
    } finally {
      reg.close();
    }
  }, 120_000);

  it('[DIST-AC-9] install finds an app outside the catalog by its name in the registry', async () => {
    // A package published after this CLI was built: not in its catalog.
    const reg = await registry(sourceHelloTarball('app.newer'), { id: 'app.newer' });
    try {
      const env = { npm_config_registry: reg.url };
      // The workspace knows no apps at all; the registry has the package.
      mkdirSync(dirname(homeConfig()), { recursive: true });
      writeFileSync(homeConfig(), JSON.stringify({ apps: [] }));
      const installed = await agentapps(['install', 'app.newer', 'newer', '-y'], env);
      expect(installed.code).toBe(0);
      expect(readFileSync(homeConfig(), 'utf8')).toContain('npm:@agentapps/app.newer');
      expect((await agentapps(['installations'], env)).out).toContain('newer');

      const absent = await agentapps(['install', 'app.absent', 'absent', '-y'], env);
      expect(absent.code).not.toBe(0);
      expect(absent.out).toContain('App not found: app.absent');
      expect((await agentapps(['installations'], env)).out).not.toContain('absent');
      expect(readFileSync(homeConfig(), 'utf8')).not.toContain('app.absent');
    } finally {
      reg.close();
    }
  }, 120_000);
});

describe('the first minutes after installing (step 5)', () => {
  it('[DIST-AC-11] the Station starts with nothing downloaded', async () => {
    const probe = createServer();
    await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
    const port = String((probe.address() as AddressInfo).port);
    await new Promise((r) => probe.close(r));

    // The Station's own process, as `station start` runs it in the background.
    const env = { ...process.env, NODE_PATH: '', HOME: home, NO_COLOR: '1' };
    const station = spawn(process.execPath, ['--import', TSX, BIN, 'serve', port, '--foreground'], {
      cwd,
      env,
    });
    let out = '';
    const ready = new Promise<boolean>((done) => {
      const seen = (c: Buffer) => {
        out += c.toString();
        if (out.includes('server ready')) done(true);
      };
      station.stdout.on('data', seen);
      station.stderr.on('data', seen);
      station.on('close', () => done(false));
    });
    try {
      expect(await ready, out).toBe(true);
      expect(out).not.toContain('not found');
      expect(out).not.toContain('failed to load');
    } finally {
      station.kill();
    }
  }, 120_000);

  it('[DIST-AC-12] the CLI does not depend on tsx', () => {
    const pkg = JSON.parse(readFileSync(join(CLI, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };
    expect(Object.keys(pkg.dependencies)).not.toContain('tsx');
    expect(pkg.peerDependenciesMeta?.tsx?.optional).toBe(true);
  });
});

describe('publishing apps (step 4)', () => {
  it.skipIf(!hasBun)(
    '[DIST-AC-10] only apps named after their id and not opted out are published, packed',
    async () => {
      const scripts = join(CLI, 'scripts');
      const { publishableApps } = (await import(
        pathToFileURL(join(scripts, 'publishable-apps.mjs')).href
      )) as { publishableApps: (dir: string) => { manifest: { id: string } }[] };
      const apps = join(root, 'apps');
      const app = (dir: string, id: string, pkg: Record<string, unknown>) => {
        mkdirSync(join(apps, dir), { recursive: true });
        writeFileSync(join(apps, dir, 'agentapp.json'), JSON.stringify({ id }));
        writeFileSync(join(apps, dir, 'package.json'), JSON.stringify(pkg));
      };
      app('good', 'app.good', { name: '@agentapps/app.good', version: '1.0.0' });
      app('native', 'app.native', {
        name: '@agentapps/app.native',
        version: '1.0.0',
        agentapps: { publish: false },
      });
      app('misnamed', 'app.misnamed', { name: '@agentapps/example-misnamed', version: '1.0.0' });
      expect(() => publishableApps(apps)).toThrow(/misnamed.*@agentapps\/app\.misnamed/);
      rmSync(join(apps, 'misnamed'), { recursive: true });
      expect(publishableApps(apps).map((a) => a.manifest.id)).toEqual(['app.good']);

      // The release packs the repository's own apps the same way.
      const { packApp, assertSelfContained } = (await import(
        pathToFileURL(join(scripts, 'pack-app.mjs')).href
      )) as {
        packApp: (dir: string, out: string) => string;
        assertSelfContained: (dir: string) => void;
      };
      const tarball = packApp(HELLO, join(root, 'out'));
      expect(tarball).toContain('agentapps-app.hello-');
      const unpacked = join(root, 'unpacked');
      mkdirSync(unpacked);
      expect(spawnSync('tar', ['-xzf', tarball, '-C', unpacked]).status).toBe(0);
      expect(() => assertSelfContained(join(unpacked, 'package'))).not.toThrow();
    },
    120_000,
  );
});

describe.skipIf(!hasBun)('the single executable (step 2)', () => {
  let packed: Buffer;
  let packMod: {
    packApp: (dir: string, out: string) => string;
    assertSelfContained: (dir: string) => void;
  };

  beforeAll(async () => {
    const built = spawnSync(process.execPath, [join(CLI, 'scripts', 'build-executable.mjs')], {
      encoding: 'utf8',
    });
    if (built.status !== 0) throw new Error(`build-executable failed: ${built.stderr}`);
    packMod = await import(pathToFileURL(join(CLI, 'scripts', 'pack-app.mjs')).href);
    const out = mkdtempSync(join(tmpdir(), 'agentapps-packed-'));
    packed = readFileSync(packMod.packApp(HELLO, out));
    rmSync(out, { recursive: true, force: true });
  }, 300_000);

  it('[DIST-AC-4] runs without node: prints its version and lists the catalog', async () => {
    const version = await executable(['--version']);
    expect(version.code).toBe(0);
    const pkg = JSON.parse(readFileSync(join(CLI, 'package.json'), 'utf8')) as { version: string };
    expect(version.out.trim()).toBe(pkg.version);
    const apps = await executable(['apps']);
    expect(apps.out).toContain('app.hello');
  });

  it('[DIST-AC-5] the released app package is self-contained; one with dependencies is refused', () => {
    const dir = join(root, 'unpacked');
    mkdirSync(dir);
    writeFileSync(join(root, 'hello.tgz'), packed);
    expect(spawnSync('tar', ['-xzf', join(root, 'hello.tgz'), '-C', dir]).status).toBe(0);
    const pkg = JSON.parse(readFileSync(join(dir, 'package', 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(pkg.dependencies).toBeUndefined();
    // Loads with no node_modules anywhere near it.
    const loaded = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const m = await import('./dist/app.js'); console.log(typeof m.factory);",
      ],
      { cwd: join(dir, 'package'), env: { PATH: process.env.PATH }, encoding: 'utf8' },
    );
    expect(loaded.stdout.trim()).toBe('function');

    writeFileSync(
      join(dir, 'package', 'package.json'),
      JSON.stringify({ ...pkg, dependencies: { '@agentapps/sdk': '1.0.0' } }),
    );
    expect(() => packMod.assertSelfContained(join(dir, 'package'))).toThrow(/self-contained/);
  });

  it('[DIST-AC-6] installs from the registry without npm; a tarball with the wrong hash is refused', async () => {
    const bad = await registry(packed, { badHash: true });
    try {
      const refused = await executable(['install', 'app.hello', 'hello', '-y'], {
        npm_config_registry: bad.url,
      });
      expect(refused.code).not.toBe(0);
      expect(refused.out).toContain('integrity');
      expect((await executable(['installations'])).out).not.toContain('hello');
    } finally {
      bad.close();
    }

    const reg = await registry(packed);
    try {
      const env = { npm_config_registry: reg.url };
      const installed = await executable(['install', 'app.hello', 'hello', '-y'], env);
      expect(installed.code).toBe(0);
      expect((await executable(['hello', 'tool', 'greet', 'name:World'], env)).out).toContain(
        'Hello, World!',
      );
    } finally {
      reg.close();
    }
  }, 120_000);
});

describe.skipIf(!hasBun)('the installer (step 3)', () => {
  const RELEASE = join(CLI, 'dist-release');
  let manifest: {
    version: string;
    assets: Record<string, { url: string; sha256: string; size: number }>;
  };

  beforeAll(() => {
    const built = spawnSync(process.execPath, [join(CLI, 'scripts', 'build-release.mjs')], {
      encoding: 'utf8',
    });
    if (built.status !== 0) throw new Error(`build-release failed: ${built.stderr}`);
    manifest = JSON.parse(readFileSync(join(RELEASE, 'manifest.json'), 'utf8'));
  }, 300_000);

  /** Serve the release folder; `override` replaces manifest.json. */
  async function serveRelease(override?: unknown): Promise<{ url: string; close: () => void }> {
    const server = createServer((req, res) => {
      const name = (req.url ?? '/').slice(1);
      if (name === 'manifest.json' && override) {
        res.end(`${JSON.stringify(override, null, 2)}\n`);
        return;
      }
      const file = join(RELEASE, name);
      if (!name || name.includes('/') || !existsSync(file)) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.end(readFileSync(file));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return {
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      close: () => server.close(),
    };
  }

  /** `curl -fsSL <server>/install.sh | sh`, as the website will tell people to run it. */
  function curlPipeSh(base: string): Promise<Run> {
    return exec('sh', ['-c', 'curl -fsSL "$AGENTAPPS_BASE_URL/install.sh" | sh'], {
      HOME: home,
      PATH: '/usr/bin:/bin',
      SHELL: '/bin/zsh',
      AGENTAPPS_BASE_URL: base,
    });
  }

  const installed = () => join(home, '.local', 'bin', 'agentapps');
  const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

  it('[DIST-AC-7] the manifest matches the executable it lists', () => {
    const asset = manifest.assets[PLATFORM];
    expect(asset.url).toBe(`https://get.agentapps.tech/agentapps-${PLATFORM}`);
    const file = join(RELEASE, `agentapps-${PLATFORM}`);
    expect(asset.sha256).toBe(sha256(file));
    expect(asset.size).toBe(readFileSync(file).length);
    expect(existsSync(join(RELEASE, 'install.sh'))).toBe(true);
  });

  it('[DIST-AC-8] curl | sh installs, is idempotent, and refuses a bad download', async () => {
    const release = await serveRelease();
    try {
      const first = await curlPipeSh(release.url);
      expect(first.code).toBe(0);
      expect(first.out).toContain('agentapps station start');
      expect(first.out).toContain('agentapps connect claude-code');
      const ran = await exec(installed(), ['--version'], { HOME: home, PATH: '/usr/bin:/bin' });
      expect(ran.out.trim()).toBe(manifest.version);

      const second = await curlPipeSh(release.url);
      expect(second.code).toBe(0);
      expect(second.out).toContain('already installed');
      const rc = readFileSync(join(home, '.zshrc'), 'utf8');
      expect(rc.match(/# agentapps/g)).toHaveLength(1);
    } finally {
      release.close();
    }

    // A newer version whose download does not match its hash.
    const before = sha256(installed());
    const tampered = structuredClone(manifest);
    tampered.version = '99.0.0';
    tampered.assets[PLATFORM].sha256 = '0'.repeat(64);
    const bad = await serveRelease(tampered);
    try {
      const refused = await curlPipeSh(bad.url);
      expect(refused.code).not.toBe(0);
      expect(refused.out).toContain('does not match its sha256');
      expect(sha256(installed())).toBe(before);
      expect(readdirSync(join(home, '.local', 'bin'))).toEqual(['agentapps']);
    } finally {
      bad.close();
    }
  }, 300_000);
});
