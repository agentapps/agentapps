/**
 * The CLI is a client of one Station (CLIENT), and its administrative
 * commands are Station operations (STADMIN).
 */

import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dispatchCommand } from '../src/dispatch.js';
import { parseReplTokens } from '../src/repl-parser.js';
import { loadStationLogin } from '../src/station-client.js';
import { offerStation } from '../src/station-offer.js';
import type { CliContext } from '../src/types.js';
import { PROBE_APP, writeProbeApp } from './support/probe-app.js';
import { freePort, stationSettings } from './support/spawned.js';
import {
  ADMIN_TOKEN,
  options,
  startWorkspace,
  type TestWorkspace,
  writeApp,
} from './support/workspace.js';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(here, '..', 'src', 'bin.ts');
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;

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

function said(result: { message?: string; error?: { message?: string; suggestion?: string } }) {
  return `${result.message ?? ''}\n${result.error?.message ?? ''}\n${result.error?.suggestion ?? ''}`;
}

const status = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(5000) }).then(
    (r) => r.status,
    () => 'refused' as const,
  );

// ---------------------------------------------------------------------------
// The real command, against a Station in its own process
// ---------------------------------------------------------------------------

describe('the agentapps command and its Station', () => {
  let home: string;
  let port: number;
  let probe: { source: string; remove: () => void };

  const cli = (args: string[], cwd = home) => {
    const run = spawnSync(process.execPath, ['--import', TSX, BIN, ...args], {
      cwd,
      env: { ...process.env, NODE_PATH: '', HOME: home, NO_COLOR: '1' },
      encoding: 'utf8',
      timeout: 60_000,
    });
    return { code: run.status, out: `${run.stdout}${run.stderr}` };
  };
  const stationMeta = () =>
    JSON.parse(readFileSync(join(home, '.agentapps', 'station.json'), 'utf8')) as {
      pid: number;
      adminToken: string;
      logPath: string;
    };

  beforeAll(() => {
    probe = writeProbeApp();
  });
  afterAll(() => probe.remove());

  afterEach(() => {
    if (home && existsSync(join(home, '.agentapps', 'station.json'))) cli(['station', 'stop']);
    if (home) rmSync(home, { recursive: true, force: true });
  });

  async function workspace(extra: Record<string, unknown> = {}): Promise<void> {
    home = mkdtempSync(join(tmpdir(), 'agentapps-client-'));
    port = await freePort();
    writeFileSync(
      join(home, 'agentapps.json'),
      JSON.stringify({ ...stationSettings(port), apps: [{ source: probe.source }], ...extra }),
    );
  }

  it('[CLIENT-AC-1] [CLIENT-AC-8] a tool runs in the Station, and two runs reach the same Instance', async () => {
    await workspace();
    expect(cli(['station', 'start']).code).toBe(0);
    expect(cli(['install', PROBE_APP, 'probe', '-y']).code).toBe(0);

    const first = cli(['probe', 'where', '--json']);
    expect(first.code, first.out).toBe(0);
    const second = cli(['probe', 'where', '--json']);
    const one = JSON.parse(first.out) as { data: { pid: number; startedAt: string } };
    const two = JSON.parse(second.out) as { data: { pid: number; startedAt: string } };

    // The App's code ran in the Station's process, not in the command's.
    expect(one.data.pid).toBe(stationMeta().pid);
    // Two commands, one Instance: it outlived the first.
    expect(two.data.startedAt).toBe(one.data.startedAt);
  }, 120_000);

  it('[CLIENT-AC-9] the admin credential is neither printed nor logged', async () => {
    await workspace();
    const started = cli(['station', 'start']);
    const outputs = [
      started.out,
      cli(['install', PROBE_APP, 'probe', '-y']).out,
      cli(['probe', 'where']).out,
      cli(['station', 'status']).out,
      cli(['installations']).out,
    ];
    const { adminToken, logPath } = stationMeta();
    expect(adminToken.length).toBeGreaterThan(20);
    expect(outputs.join('\n')).not.toContain(adminToken);
    expect(readFileSync(logPath, 'utf8')).not.toContain(adminToken);
  }, 120_000);

  it('[CLIENT-AC-3] with a local Station stopped, a command says how to start it and starts nothing', async () => {
    await workspace();
    for (const args of [
      ['probe', 'where'],
      ['installations'],
      ['install', PROBE_APP, 'probe', '-y'],
      ['config', PROBE_APP, 'KEY:value'],
    ]) {
      const run = cli(args);
      expect(run.code, `${args.join(' ')}: ${run.out}`).toBe(2);
      expect(run.out).toContain('agentapps station start');
    }
    expect(await status(`http://127.0.0.1:${port}/health`)).toBe('refused');
    expect(existsSync(join(home, '.agentapps', 'station.json'))).toBe(false);
  }, 120_000);

  it('[CLIENT-AC-4] with a Station elsewhere unreachable, a command names its URL and offers no start', async () => {
    await workspace({ cli: { stationUrl: 'http://station.invalid:4100' } });
    const run = cli(['probe', 'where']);
    expect(run.code, run.out).toBe(2);
    expect(run.out).toContain('http://station.invalid:4100');
    expect(run.out).not.toContain('station start');
  }, 120_000);

  it('[CLIENT-AC-7] the commands that need no Station work with none running', async () => {
    await workspace();
    for (const args of [
      ['help'],
      ['--version'],
      ['apps'],
      ['station', 'status'],
      ['station', 'stop'],
      ['station', 'use', `http://localhost:${port}`],
      ['station', 'logout'],
      ['--get-completions', 'ins'],
    ]) {
      const run = cli(args);
      expect(run.code, `${args.join(' ')}: ${run.out}`).toBe(0);
    }
    expect(await status(`http://127.0.0.1:${port}/health`)).toBe('refused');
  }, 120_000);

  it('[CLIENT-AC-13] serve starts the Station of the station block, whatever Station the CLI points at', async () => {
    await workspace({ cli: { stationUrl: 'https://station.example.com' } });
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
      expect(out).toContain(`OAuth callback: http://localhost:${port}/auth/callback`);
      expect(out).not.toContain('station.example.com');
    } finally {
      station.kill('SIGKILL');
    }
  }, 60_000);

  it('[STADMIN-AC-14] [STADMIN-AC-15] serve refuses to start without the Station id or the workspace id', async () => {
    for (const missing of ['station', 'workspace'] as const) {
      await workspace();
      const config = JSON.parse(readFileSync(join(home, 'agentapps.json'), 'utf8'));
      if (missing === 'station') delete config.station.id;
      else delete config.workspace;
      writeFileSync(join(home, 'agentapps.json'), JSON.stringify(config));

      const run = cli(['serve', String(port)]);
      expect(run.code, run.out).not.toBe(0);
      expect(run.out).toContain(
        missing === 'station' ? '"station": { "id"' : '"workspace": { "id"',
      );
      expect(await status(`http://127.0.0.1:${port}/health`)).toBe('refused');
      rmSync(home, { recursive: true, force: true });
    }
  }, 120_000);

  it('[STADMIN-AC-14] the Station finds its secrets again on another port, by its id', async () => {
    await workspace();
    expect(cli(['station', 'start']).code).toBe(0);
    expect(cli(['install', PROBE_APP, 'probe', '-y']).code).toBe(0);
    expect(cli(['station', 'stop']).code).toBe(0);

    // The same Station, moved to another port and another public URL.
    const moved = await freePort();
    const config = JSON.parse(readFileSync(join(home, 'agentapps.json'), 'utf8'));
    config.station.port = moved;
    config.station.publicUrl = `http://localhost:${moved}`;
    config.cli.stationUrl = `http://localhost:${moved}`;
    writeFileSync(join(home, 'agentapps.json'), JSON.stringify(config));
    expect(cli(['station', 'start']).code).toBe(0);
    const health = (await (await fetch(`http://127.0.0.1:${moved}/health`)).json()) as {
      stationId: string;
    };
    expect(health.stationId).toBe('stn_test');
    expect(cli(['installations']).out).toContain('probe');
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Commands, against a Station in this process
// ---------------------------------------------------------------------------

describe('commands as clients of the Station', () => {
  let workspace: TestWorkspace | undefined;
  let other: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await workspace?.stop();
    workspace = undefined;
    if (other) rmSync(other, { recursive: true, force: true });
    other = undefined;
  });

  const helloSource = resolve(here, '../../../apps/hello');
  const run = (ctx: CliContext, tokens: string[], io: Record<string, unknown> = {}) =>
    dispatchCommand(
      parseReplTokens(tokens, { configPath: ctx.configPath, config: ctx.config, aliases: [] }),
      { ctx, options: options({ yes: true }), ...io },
    );

  it('[CLIENT-AC-1] a tool call is a request to the Station, with the CLI’s credential', async () => {
    workspace = await startWorkspace({ sources: [helloSource] });
    const ctx = workspace.ctx();
    await run(ctx, ['install', 'app.hello', 'hello']);
    const fetched = vi.spyOn(globalThis, 'fetch');

    const result = await run(ctx, ['hello', 'greet', 'name:World']);
    expect(JSON.stringify(result.data)).toContain('Hello, World!');

    const messages = fetched.mock.calls.filter((call) => String(call[0]).endsWith('/messages'));
    expect(messages.length).toBeGreaterThanOrEqual(3);
    for (const call of fetched.mock.calls) {
      expect(String(call[0]).startsWith((workspace as TestWorkspace).url)).toBe(true);
      const headers = (call[1] as RequestInit | undefined)?.headers as Record<string, string>;
      if (String(call[0]).endsWith('/health')) continue;
      expect(headers.Authorization).toBe(`Bearer ${ADMIN_TOKEN}`);
    }
  });

  it('[CLIENT-AC-2] the Station applies the Policy to the CLI’s calls: deny refuses, ask is answered inline', async () => {
    workspace = await startWorkspace({ sources: [helloSource] });
    const ctx = workspace.ctx();
    await run(ctx, ['install', 'app.hello', 'hello']);

    expect((await run(ctx, ['policy', 'set', 'admin', 'app.hello', 'greet', 'deny'])).success).toBe(
      true,
    );
    const denied = await run(ctx, ['hello', 'greet', 'name:World']);
    expect(denied.exitCode).toBe(2);
    expect(said(denied)).toContain("rule 'app.hello/greet'");

    // An ask: `-y` approves it up front; without it and without a terminal, it is not approved.
    await run(ctx, ['policy', 'set', 'admin', 'app.hello', 'greet', 'ask']);
    expect((await run(ctx, ['hello', 'greet', 'name:World'])).success).toBe(true);
    const tty = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      const unanswered = await dispatchCommand(
        { type: 'tool', alias: 'hello', toolName: 'greet', args: ['name:World'] },
        { ctx, options: options() },
      );
      expect(unanswered.exitCode).toBe(2);
      expect(said(unanswered)).toContain('needs approval');
    } finally {
      process.stdin.isTTY = tty;
    }
  });

  it('[CLIENT-AC-10] [CLIENT-AC-11] station login checks the key, keeps it for that Station, and commands then use it', async () => {
    workspace = await startWorkspace({ sources: [helloSource] });
    const ctx = workspace.ctx();
    await run(ctx, ['install', 'app.hello', 'hello']);
    const created = await run(ctx, ['key', 'create', 'ana', 'u1', 'role:workspace-owner']);
    const key = /Key: (aak_[0-9a-f]+)/.exec(created.message ?? '')?.[1] as string;
    expect(key).toBeDefined();
    const before = readFileSync(ctx.configPath, 'utf8');

    // The key is never an argument.
    expect(
      parseReplTokens(['station', 'login', key], {
        configPath: ctx.configPath,
        config: ctx.config,
        aliases: [],
      }).type,
    ).toBe('usage');

    const wrong = await run(ctx, ['station', 'login'], {
      input: lines('aak_wrong'),
      output: sink().stream,
    });
    expect(wrong.exitCode).toBe(2);
    expect(loadStationLogin(ctx.configPath, workspace.url)).toBeUndefined();

    const output = sink();
    const logged = await run(ctx, ['station', 'login'], {
      input: lines(key),
      output: output.stream,
    });
    expect(logged.exitCode, said(logged)).toBe(0);
    expect(said(logged)).toContain('workspace-owner');
    expect(`${said(logged)}${output.text()}`).not.toContain(key);
    const dir = join(workspace.dir, '.secrets', 'stations');
    const file = join(dir, readdirSync(dir)[0] as string);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(ctx.configPath, 'utf8')).toBe(before);

    // Commands now carry that key, and the CLI is that Principal: an Owner, not the Operator.
    const fetched = vi.spyOn(globalThis, 'fetch');
    expect((await run(ctx, ['hello', 'greet', 'name:Ana'])).success).toBe(true);
    const sent = fetched.mock.calls
      .map(
        (call) =>
          ((call[1] as RequestInit | undefined)?.headers as Record<string, string>)?.Authorization,
      )
      .filter(Boolean);
    expect(new Set(sent)).toEqual(new Set([`Bearer ${key}`]));
    expect((await run(ctx, ['config', 'app.hello', 'unset', 'ANY'])).exitCode).toBe(2);
    fetched.mockRestore();

    const out = await run(ctx, ['station', 'logout']);
    expect(said(out)).toContain('removed');
    expect(loadStationLogin(ctx.configPath, workspace.url)).toBeUndefined();
    expect(readFileSync(ctx.configPath, 'utf8')).toBe(before);
    expect(said(await run(ctx, ['station', 'logout']))).toContain('no key stored');

    // With no credential at all for a Station that answers, the command says how to get one.
    rmSync(join(workspace.dir, '.agentapps', 'station.json'));
    const none = await run(ctx, ['hello', 'greet', 'name:Ana']);
    expect(none.exitCode).toBe(2);
    expect(said(none)).toContain('agentapps station login');
  });

  it('[CLIENT-AC-12] station use writes cli.stationUrl and nothing else, without contacting anyone', async () => {
    workspace = await startWorkspace();
    const ctx = workspace.ctx();
    const before = JSON.parse(readFileSync(ctx.configPath, 'utf8'));
    const fetched = vi.spyOn(globalThis, 'fetch');

    const used = await run(ctx, ['station', 'use', 'https://station.example.com/']);
    expect(used.exitCode).toBe(0);
    expect(said(used)).toContain('agentapps station login');
    expect(fetched).not.toHaveBeenCalled();
    const after = JSON.parse(readFileSync(ctx.configPath, 'utf8'));
    expect(after.cli).toEqual({ stationUrl: 'https://station.example.com' });
    expect({ ...after, cli: undefined }).toEqual({ ...before, cli: undefined });

    const raw = readFileSync(ctx.configPath, 'utf8');
    const refused = await run(workspace.ctx(), ['station', 'use', 'not-a-url']);
    expect(refused.exitCode).toBe(2);
    expect(readFileSync(ctx.configPath, 'utf8')).toBe(raw);

    // A workspace that names no Station says how to name one, and calls nobody.
    delete after.cli;
    writeFileSync(ctx.configPath, JSON.stringify(after));
    const none = await run(workspace.ctx(), ['installations']);
    expect(none.exitCode).toBe(2);
    expect(said(none)).toContain('agentapps station use');
    expect(fetched).not.toHaveBeenCalled();
  });

  it('[STADMIN-AC-6] administrative commands are requests to the Station: the CLI’s own directory holds none of its state', async () => {
    workspace = await startWorkspace({ sources: [helloSource] });
    // A CLI in another directory, pointed at that Station and logged in as its admin.
    other = mkdtempSync(join(tmpdir(), 'agentapps-remote-cli-'));
    const configPath = join(other, 'agentapps.json');
    writeFileSync(configPath, JSON.stringify({ apps: [], cli: { stationUrl: workspace.url } }));
    const station = workspace;
    const ctx: CliContext = {
      cwd: other,
      configPath,
      config: { apps: {}, cli: { stationUrl: station.url } },
    };
    const login = await run(ctx, ['station', 'login'], {
      input: lines(ADMIN_TOKEN),
      output: sink().stream,
    });
    expect(login.exitCode, said(login)).toBe(0);
    const fetched = vi.spyOn(globalThis, 'fetch');

    const steps: string[][] = [
      ['install', 'app.hello', 'hello'],
      ['config', 'hello', 'unset', 'NOTHING'],
      ['rename', 'hello', 'hola'],
      ['hola', 'auth', 'logout'],
      ['bind', 'hola', 'files', 'hola'],
      ['key', 'create', 'bot', 'u1'],
      ['policy', 'set', 'bot', 'app.hello', 'greet', 'deny'],
      ['uninstall', 'hola'],
    ];
    for (const tokens of steps) {
      const before = fetched.mock.calls.length;
      await run(ctx, tokens);
      expect(fetched.mock.calls.length, tokens.join(' ')).toBeGreaterThan(before);
    }
    for (const call of fetched.mock.calls)
      expect(String(call[0]).startsWith(station.url)).toBe(true);

    // Nothing of the Station's state is in the CLI's directory …
    expect(existsSync(join(other, '.secrets', 'apps'))).toBe(false);
    expect(existsSync(join(other, '.agentapps', 'installations.json'))).toBe(false);
    expect(existsSync(join(other, '.agentapps', 'installation-secrets'))).toBe(false);
    expect(existsSync(join(other, '.agentapps', 'api-keys.json'))).toBe(false);
    // … it is in the Station's.
    expect(readFileSync(join(station.dir, '.agentapps', 'api-keys.json'), 'utf8')).toContain('bot');

    // With that Station stopped, each of them says so.
    await station.stop();
    workspace = undefined;
    const stopped = await run(ctx, ['install', 'app.hello', 'hello']);
    expect(stopped.exitCode).toBe(2);
    expect(said(stopped)).toContain('station start');
  });

  it('[STADMIN-AC-7] a workspace made before these specs is served unchanged', async () => {
    // What the CLI of the previous version left on disk.
    const dir = mkdtempSync(join(tmpdir(), 'agentapps-old-workspace-'));
    other = dir;
    const app = writeApp(join(dir, 'app.old'), {
      id: 'app.old',
      version: '1.0.0',
      auth: { type: 'api-key', systemSecrets: ['APIKEY'], installationSecrets: ['TOKEN'] },
    });
    const state = join(dir, '.agentapps');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(state, 'installation-secrets'), { recursive: true });
    mkdirSync(join(dir, '.secrets', 'apps'), { recursive: true });
    const now = new Date().toISOString();
    writeFileSync(
      join(state, 'installations.json'),
      JSON.stringify([
        { installationId: 'ins_old00001', alias: 'old', appId: 'app.old', installedAt: now },
      ]),
    );
    writeFileSync(
      join(state, 'installation-secrets', 'ins_old00001.json'),
      JSON.stringify({ TOKEN: 't' }),
    );
    writeFileSync(join(dir, '.secrets', 'apps', 'app.old.json'), JSON.stringify({ APIKEY: 'k' }));
    writeFileSync(
      join(state, 'api-keys.json'),
      JSON.stringify([
        {
          id: 'ak_old',
          name: 'claude-code',
          keyHash: 'a'.repeat(64),
          prefix: 'aak_old',
          identity: { userId: 'pablo' },
          principalId: 'ak_old',
          createdAt: now,
          updatedAt: now,
        },
      ]),
    );
    writeFileSync(
      join(state, 'policies.json'),
      JSON.stringify([
        {
          principalId: 'ak_old',
          approver: 'admin',
          defaultEffect: 'allow',
          rules: [{ id: 'app.old/x', app: 'app.old', tool: 'x', effect: 'deny' }],
          createdAt: now,
          updatedAt: now,
        },
      ]),
    );

    workspace = await startWorkspace({ dir, sources: [app] });
    const ctx = workspace.ctx();
    const listed = await run(ctx, ['installations']);
    expect(listed.data).toEqual([{ Alias: 'old', 'App ID': 'app.old', Status: '✓ api key set' }]);
    const keys = await run(ctx, ['key', 'list']);
    expect(JSON.stringify(keys.data)).toContain('claude-code');
    expect(JSON.stringify(keys.data)).toContain('workspace-member');
    const policy = await run(ctx, ['policy', 'show', 'claude-code']);
    expect(JSON.stringify(policy.data)).toContain('app.old/x');
  });
});

// ---------------------------------------------------------------------------
// The interactive mode and a Station that is not running
// ---------------------------------------------------------------------------

describe('the interactive mode when its Station is not running', () => {
  let home: string | undefined;

  afterEach(() => {
    if (!home) return;
    if (existsSync(join(home, '.agentapps', 'station.json'))) {
      spawnSync(process.execPath, ['--import', TSX, BIN, 'station', 'stop'], {
        cwd: home,
        env: { ...process.env, NODE_PATH: '', HOME: home, NO_COLOR: '1' },
      });
    }
    rmSync(home, { recursive: true, force: true });
    home = undefined;
  });

  async function localWorkspace(): Promise<{ ctx: CliContext; port: number }> {
    home = mkdtempSync(join(tmpdir(), 'agentapps-offer-'));
    const port = await freePort();
    const configPath = join(home, 'agentapps.json');
    writeFileSync(configPath, JSON.stringify({ ...stationSettings(port), apps: [] }));
    const { loadWorkspaceConfig } = await import('../src/config.js');
    return { ctx: { cwd: home, configPath, config: loadWorkspaceConfig(configPath) }, port };
  }

  it('[CLIENT-AC-5] it asks; a no starts nothing, and commands then say how to start it', async () => {
    const { ctx, port } = await localWorkspace();
    const output = sink();
    await offerStation({ ctx, options: options(), input: lines('n'), output: output.stream });

    expect(output.text()).toContain('The Station is not running');
    expect(output.text()).toContain('Start it and leave it running? [y/N]');
    expect(await status(`http://127.0.0.1:${port}/health`)).toBe('refused');
    const after = await dispatchCommand({ type: 'installations' }, { ctx, options: options() });
    expect(after.exitCode).toBe(2);
    expect(said(after)).toContain('agentapps station start');
  }, 60_000);

  it('[CLIENT-AC-5] a yes starts it, and it keeps running after the interactive mode ends', async () => {
    const { port } = await localWorkspace();
    // The real interactive mode, with its answers on stdin: yes, one command, leave.
    const repl = spawnSync(process.execPath, ['--import', TSX, BIN], {
      cwd: home,
      env: { ...process.env, NODE_PATH: '', HOME: home, NO_COLOR: '1' },
      input: 'y\ninstallations\nexit\n',
      encoding: 'utf8',
      timeout: 60_000,
    });
    const text = `${repl.stdout}${repl.stderr}`;

    expect(text).toContain('The Station is not running');
    expect(text).toContain('It keeps running after you leave.');
    // The command typed after the answer reached the Station that was started.
    expect(text).toContain('No apps installed.');
    expect(repl.status, text).toBe(0);
    expect(await status(`http://127.0.0.1:${port}/health`)).toBe(200);
  }, 90_000);

  it('[CLIENT-AC-6] for a Station elsewhere it names the URL and asks nothing', async () => {
    const { ctx } = await localWorkspace();
    ctx.config = { ...ctx.config, cli: { stationUrl: 'http://station.invalid:4100' } };
    const output = sink();
    await offerStation({ ctx, options: options(), input: lines('y'), output: output.stream });

    expect(output.text()).toContain('Cannot connect to the Station at http://station.invalid:4100');
    expect(output.text()).not.toContain('Start it');
  }, 60_000);

  it('a Station that is already running is not mentioned', async () => {
    const workspace = await startWorkspace();
    try {
      const output = sink();
      await offerStation({
        ctx: workspace.ctx(),
        options: options(),
        input: lines(),
        output: output.stream,
      });
      expect(output.text()).toBe('');
    } finally {
      await workspace.stop();
    }
  });
});
