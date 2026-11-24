/**
 * Setup instructions, the Station the CLI connects to, and a Station's public
 * URL (SETUP).
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAuth } from '../src/commands/auth.js';
import { handleConfig } from '../src/commands/config.js';
import { appSecretsPath } from '../src/secrets-store.js';
import { addInstallation } from '../src/state.js';
import type { CliContext } from '../src/types.js';
import { options, startWorkspace, type TestWorkspace, writeApp } from './support/workspace.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..', '..', '..');
const BIN = resolve(here, '..', 'src', 'bin.ts');
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;

const APP = 'app.google.gmail';
const ALIAS = 'gmail-personal';
const SETUP =
  'To configure Gmail:\n  1. Create an OAuth client\n  2. Add this redirect URI: {{redirectUri}}';

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const { port } = probe.address() as { port: number };
  await new Promise((r) => probe.close(r));
  return port;
}

function sink(): { stream: Writable; text: () => string } {
  const chunks: string[] = [];
  return {
    stream: new Writable({
      write(chunk, _encoding, done) {
        chunks.push(chunk.toString());
        done();
      },
    }),
    text: () => chunks.join(''),
  };
}

function lines(...answers: string[]): Readable {
  const input = new Readable({ read() {} });
  for (const answer of answers) input.push(`${answer}\n`);
  input.push(null);
  return input;
}

function said(result: { error?: { message?: string; suggestion?: string } }): string {
  return `${result.error?.message ?? ''}\n${result.error?.suggestion ?? ''}`;
}

describe('SETUP in the CLI', () => {
  let workspace: TestWorkspace | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await workspace?.stop();
    workspace = undefined;
  });

  const auth = (setup?: string) => ({
    type: 'oauth2',
    provider: 'google',
    authorizeUrl: 'https://accounts.example.com/authorize',
    tokenUrl: 'https://accounts.example.com/token',
    scopes: ['email'],
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    ...(setup ? { setup } : {}),
  });

  /** A workspace with the Gmail app, its Station running with public URL http://localhost:4100. */
  async function start(setup?: string): Promise<TestWorkspace> {
    const dir = mkdtempSync(join(tmpdir(), 'agentapps-setup-'));
    const source = writeApp(join(dir, APP), {
      id: APP,
      version: '1.0.0',
      name: 'Gmail',
      auth: auth(setup),
    });
    workspace = await startWorkspace({ dir, sources: [source] });
    return workspace;
  }

  /** The workspace's context, pointed at another Station URL or at none. */
  function pointedAt(ws: TestWorkspace, stationUrl: string | undefined): CliContext {
    const ctx = ws.ctx();
    return { ...ctx, config: { ...ctx.config, cli: stationUrl ? { stationUrl } : {} } };
  }

  it('[SETUP-AC-5] interactive config prints the resolved instructions before the first prompt', async () => {
    const ws = await start(SETUP);
    const output = sink();

    const result = await handleConfig(
      { type: 'config', appId: APP, args: [] },
      { ctx: ws.ctx(), options: options(), input: lines('abc', 'xyz'), output: output.stream },
    );

    expect(said(result)).toBe('\n');
    expect(result.success).toBe(true);
    const text = output.text();
    const instructions = text.indexOf('Add this redirect URI: http://localhost:4100/auth/callback');
    expect(instructions).toBeGreaterThanOrEqual(0);
    expect(text).not.toContain('{{redirectUri}}');
    expect(instructions).toBeLessThan(text.indexOf('Enter CLIENT_ID:'));
    const stored = JSON.parse(readFileSync(appSecretsPath(ws.configPath, APP), 'utf8'));
    expect(stored).toEqual({ CLIENT_ID: 'abc', CLIENT_SECRET: 'xyz' });
  });

  it('[SETUP-AC-15] explicit config prints no setup instructions', async () => {
    const ws = await start(SETUP);
    const output = sink();
    const fetched = vi.spyOn(globalThis, 'fetch');

    const result = await handleConfig(
      { type: 'config', appId: APP, args: ['CLIENT_ID:"abc"'] },
      { ctx: ws.ctx(), options: options(), output: output.stream },
    );

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    // The Station is asked to keep the value, never for the instructions.
    const asked = fetched.mock.calls.map((call) => String(call[0]));
    expect(asked.some((url) => url.endsWith('/setup'))).toBe(false);
    expect(output.text()).toBe('');
    expect(`${result.message ?? ''}${JSON.stringify(result.data ?? {})}`).not.toContain(
      'redirect URI',
    );
  });

  it('an app with no setup instructions is asked for its secrets and nothing else', async () => {
    const ws = await start();
    const output = sink();
    const fetched = vi.spyOn(globalThis, 'fetch');

    const result = await handleConfig(
      { type: 'config', appId: APP, args: [] },
      { ctx: ws.ctx(), options: options(), input: lines('abc', 'xyz'), output: output.stream },
    );

    expect(result.success).toBe(true);
    expect(fetched.mock.calls.some((call) => String(call[0]).endsWith('/setup'))).toBe(false);
    expect(output.text().startsWith('Enter CLIENT_ID:')).toBe(true);
  });

  it('[SETUP-AC-7] config says so when the Station is not running', async () => {
    const ws = await start(SETUP);
    const ctx = pointedAt(ws, `http://localhost:${await freePort()}`);

    const result = await handleConfig(
      { type: 'config', appId: APP, args: [] },
      { ctx, options: options(), input: lines('abc', 'xyz'), output: sink().stream },
    );

    expect(result.exitCode).toBe(2);
    expect(said(result)).toContain('agentapps station start');
    expect(existsSync(appSecretsPath(ws.configPath, APP))).toBe(false);
  });

  it('[SETUP-AC-8] config refuses a redirect URI and stores nothing', async () => {
    const ws = await start(SETUP);

    const result = await handleConfig(
      { type: 'config', appId: APP, args: ['REDIRECT_URI:"http://x/auth/callback"'] },
      { ctx: ws.ctx(), options: options() },
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(said(result)).toContain('the Station supplies it');
    expect(existsSync(appSecretsPath(ws.configPath, APP))).toBe(false);
  });

  it('[SETUP-AC-6] auth finds the Station by cli.stationUrl, whatever redirect URI is stored', async () => {
    const ws = await start();
    addInstallation(ws.configPath, ALIAS, APP);
    const secretsPath = appSecretsPath(ws.configPath, APP);
    mkdirSync(dirname(secretsPath), { recursive: true });
    writeFileSync(
      secretsPath,
      JSON.stringify({
        CLIENT_ID: 'client-id',
        CLIENT_SECRET: 'client-secret',
        REDIRECT_URI: 'http://localhost:3100/auth/callback',
      }),
    );
    const fetched = vi.spyOn(globalThis, 'fetch');

    const result = await handleAuth(
      { type: 'auth', alias: ALIAS },
      { ctx: ws.ctx(), options: options({ urlOnly: true }) },
    );

    expect(said(result)).toBe('\n');
    expect(result.success).toBe(true);
    // Every request went to the Station of cli.stationUrl.
    for (const call of fetched.mock.calls) expect(String(call[0]).startsWith(ws.url)).toBe(true);
    const authorizeUrl = new URL(result.message ?? '');
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4100/auth/callback',
    );
    expect(JSON.stringify(result.data)).not.toContain('3100');
  });

  it('[SETUP-AC-6] auth without cli.stationUrl says how to set it and calls no URL', async () => {
    const ws = await start();
    addInstallation(ws.configPath, ALIAS, APP);
    const fetched = vi.spyOn(globalThis, 'fetch');

    const result = await handleAuth(
      { type: 'auth', alias: ALIAS },
      { ctx: pointedAt(ws, undefined), options: options({ urlOnly: true }) },
    );

    expect(result.exitCode).toBe(2);
    expect(said(result)).toContain('agentapps station use');
    expect(fetched).not.toHaveBeenCalled();
  });

  for (const urlOnly of [true, false]) {
    const mode = urlOnly ? 'auth --url-only' : 'auth';

    it(`[SETUP-AC-7] ${mode} says no Station is running when a local one does not answer`, async () => {
      const ws = await start();
      addInstallation(ws.configPath, ALIAS, APP);
      const ctx = pointedAt(ws, `http://localhost:${await freePort()}`);

      const result = await handleAuth(
        { type: 'auth', alias: ALIAS },
        { ctx, options: options({ urlOnly }) },
      );

      expect(result.exitCode).toBe(2);
      expect(said(result)).toContain('agentapps station start');
      expect(result.error?.message).not.toBe('fetch failed');
    });

    it(`[SETUP-AC-7] ${mode} names the URL when a Station elsewhere cannot be reached`, async () => {
      const ws = await start();
      addInstallation(ws.configPath, ALIAS, APP);
      const ctx = pointedAt(ws, 'https://station.example.com');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

      const result = await handleAuth(
        { type: 'auth', alias: ALIAS },
        { ctx, options: options({ urlOnly }) },
      );

      expect(result.exitCode).toBe(2);
      expect(said(result)).toContain('https://station.example.com');
      expect(said(result)).not.toContain('station start');
      expect(result.error?.message).not.toBe('fetch failed');
    });
  }
});

describe('SETUP through the agentapps command', () => {
  const status = (url: string) =>
    fetch(url, { signal: AbortSignal.timeout(5000) }).then(
      (r) => r.status,
      () => 'refused' as const,
    );

  function cli(args: string[], cwd: string, home: string) {
    return spawnSync(process.execPath, ['--import', TSX, BIN, ...args], {
      cwd,
      env: { ...process.env, NODE_PATH: '', HOME: home, NO_COLOR: '1' },
      encoding: 'utf8',
      timeout: 60_000,
    });
  }

  it('[SETUP-AC-12] serve without a public URL fails before listening, and shows both ways to set it', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agentapps-nopublicurl-'));
    try {
      const source = join(home, 'app.hello');
      mkdirSync(join(source, 'dist'), { recursive: true });
      writeFileSync(
        join(source, 'agentapp.json'),
        JSON.stringify({ id: 'app.hello', version: '1.0.0' }),
      );
      writeFileSync(join(source, 'dist', 'app.js'), 'export default function factory() {}\n');
      writeFileSync(join(home, 'agentapps.json'), JSON.stringify({ apps: [{ source }] }));
      const port = await freePort();

      for (const args of [
        ['serve', String(port)],
        ['serve', String(port), '--foreground'],
        ['station', 'start', String(port)],
      ]) {
        const run = cli(args, home, home);
        const text = `${run.stdout}${run.stderr}`;
        expect(run.status, text).not.toBe(0);
        expect(text).toContain('"station": { "publicUrl":');
        expect(text).toContain('--public-url');
        expect(await status(`http://127.0.0.1:${port}/health`)).toBe('refused');
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('[SETUP-AC-13] a first run creates a config a Station starts from with no further configuration', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agentapps-firstrun-'));
    const port = await freePort();
    try {
      const first = cli(['apps'], home, home);
      expect(first.status, `${first.stdout}${first.stderr}`).toBe(0);

      const config = JSON.parse(
        readFileSync(join(home, '.agentapps', 'workspace', 'agentapps.json'), 'utf8'),
      );
      expect(config.station).toMatchObject({
        host: '127.0.0.1',
        port: 4100,
        publicUrl: 'http://localhost:4100',
      });
      expect(config.station.id).toMatch(/^stn_[0-9a-f]{32}$/);
      expect(config.cli).toEqual({ stationUrl: 'http://localhost:4100' });
      expect(config.workspace.id).toMatch(/^ws_[0-9a-f]{32}$/);

      // The port is given only so the test does not need 4100 to be free.
      const station = spawn(
        process.execPath,
        ['--import', TSX, BIN, 'serve', String(port), '--foreground'],
        { cwd: home, env: { ...process.env, NODE_PATH: '', HOME: home, NO_COLOR: '1' } },
      );
      try {
        const out = await new Promise<string>((done, fail) => {
          let text = '';
          const seen = (chunk: Buffer) => {
            text += chunk.toString();
            if (text.includes('Press Ctrl+C')) done(text);
          };
          station.stdout.on('data', seen);
          station.stderr.on('data', seen);
          station.on('close', () => fail(new Error(text)));
        });
        expect(out).toContain('OAuth callback: http://localhost:4100/auth/callback');
        expect(await status(`http://127.0.0.1:${port}/health`)).toBe(200);
      } finally {
        station.kill('SIGKILL');
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 60_000);

  it('[SETUP-AC-13] the example config carries the Station public URL and the CLI Station URL', () => {
    const example = JSON.parse(readFileSync(join(REPO, 'agentapps.example.json'), 'utf8'));
    expect(example.station.publicUrl).toBe('http://localhost:4100');
    expect(example.cli.stationUrl).toBe('http://localhost:4100');
  });
});
