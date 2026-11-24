/**
 * @agentapps/cli — config command tests.
 *
 * The command sets and removes secrets through the Station; the tests look at
 * what the Station's Secret Store ends up holding.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleConfig } from '../src/commands/config.js';
import { handleInstall } from '../src/commands/install.js';
import { appSecretsPath } from '../src/secrets-store.js';
import { options, startWorkspace, type TestWorkspace, writeApp } from './support/workspace.js';

const APP = 'app.example';

function lines(...answers: string[]): Readable {
  const input = new Readable({ read() {} });
  for (const answer of answers) input.push(`${answer}\n`);
  input.push(null);
  return input;
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

describe('config command', () => {
  let workspace: TestWorkspace;

  afterEach(async () => {
    await workspace?.stop();
  });

  /** A workspace whose one App declares these secrets. */
  async function withApp(auth: Record<string, unknown> | undefined): Promise<void> {
    workspace = await startWorkspace();
    await workspace.stop();
    const source = writeApp(join(workspace.dir, APP), {
      id: APP,
      version: '1.0.0',
      name: 'Example',
      ...(auth ? { auth } : {}),
    });
    workspace = await startWorkspace({ dir: workspace.dir, sources: [source] });
  }

  const oauth = (systemSecrets: string[]) => ({
    type: 'oauth2',
    provider: 'google',
    authorizeUrl: 'https://accounts.example.com/authorize',
    tokenUrl: 'https://accounts.example.com/token',
    scopes: ['email'],
    systemSecrets,
  });

  const stored = (): Record<string, string> =>
    JSON.parse(readFileSync(appSecretsPath(workspace.configPath, APP), 'utf8'));

  const config = (args: string[], io: { input?: Readable; output?: Writable } = {}) =>
    handleConfig(
      { type: 'config', appId: APP, args },
      { ctx: workspace.ctx(), options: options(), ...io },
    );

  beforeEach(() => {
    workspace = undefined as unknown as TestWorkspace;
  });

  it('configures all expected secrets in one-shot mode', async () => {
    await withApp(oauth(['CLIENT_ID', 'CLIENT_SECRET']));
    const result = await config(['CLIENT_ID:"abc"', 'CLIENT_SECRET:"xyz"']);

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.data).toMatchObject({ appId: APP, keys: ['CLIENT_ID', 'CLIENT_SECRET'] });
    expect(stored()).toEqual({ CLIENT_ID: 'abc', CLIENT_SECRET: 'xyz' });
    // What a command answers never carries a value.
    expect(JSON.stringify(result)).not.toContain('xyz');
  });

  it('rejects unknown keys in one-shot mode', async () => {
    await withApp(oauth(['CLIENT_ID']));
    const result = await config(['CLIENT_ID:"abc"', 'UNKNOWN:"xyz"']);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.error?.message).toContain('Unexpected secret(s): UNKNOWN');
    expect(result.error?.suggestion).toContain('Expected keys: CLIENT_ID');
    expect(existsSync(appSecretsPath(workspace.configPath, APP))).toBe(false);
  });

  it('allows partial updates in one-shot mode', async () => {
    await withApp(oauth(['CLIENT_ID', 'CLIENT_SECRET']));
    await config(['CLIENT_SECRET:"kept"']);
    const result = await config(['CLIENT_ID:"abc"']);

    expect(result.success).toBe(true);
    expect(stored()).toEqual({ CLIENT_ID: 'abc', CLIENT_SECRET: 'kept' });
  });

  it('rejects invalid key:value arguments', async () => {
    await withApp(oauth(['CLIENT_ID']));
    const result = await config(['CLIENT_ID']);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.error?.message).toContain('Invalid secret argument');
  });

  it('reports no system secrets when the app does not declare any', async () => {
    await withApp(undefined);
    const result = await config([]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('does not declare any system secrets');
  });

  it('returns an error when neither an app nor an Installation has that name', async () => {
    await withApp(undefined);
    const result = await handleConfig(
      { type: 'config', appId: 'app.missing', args: [] },
      { ctx: workspace.ctx(), options: options() },
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.error?.message).toContain('App or Installation not found');
  });

  it('prompts interactively for missing secrets, and never for a redirect URI', async () => {
    await withApp(oauth(['CLIENT_ID', 'CLIENT_SECRET']));
    const output = sink();
    const result = await config([], { input: lines('abc', 'xyz'), output: output.stream });

    expect(result.error).toBeUndefined();
    expect(stored()).toEqual({ CLIENT_ID: 'abc', CLIENT_SECRET: 'xyz' });
    expect(output.text()).toContain('Enter CLIENT_ID:');
    expect(output.text()).toContain('Enter CLIENT_SECRET:');
    expect(output.text()).not.toContain('REDIRECT_URI');
  });

  it('merges interactive secrets with existing stored secrets', async () => {
    await withApp(oauth(['CLIENT_ID', 'CLIENT_SECRET']));
    await config(['CLIENT_ID:"old"']);
    const result = await config([], { input: lines('new', 'secret'), output: sink().stream });

    expect(result.success).toBe(true);
    expect(stored()).toEqual({ CLIENT_ID: 'new', CLIENT_SECRET: 'secret' });
  });

  it('[STADMIN-AC-12] unset removes a secret without a trace, also one the app no longer declares', async () => {
    await withApp(oauth(['CLIENT_ID', 'CLIENT_SECRET']));
    await config(['CLIENT_SECRET:"x"']);
    // What an older version of the app left in the Station's Secret Store.
    await workspace.stop();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      appSecretsPath(workspace.configPath, APP),
      JSON.stringify({ CLIENT_SECRET: 'x', REDIRECT_URI: 'y' }),
    );
    workspace = await startWorkspace({
      dir: workspace.dir,
      sources: [join(workspace.dir, APP)],
    });

    const removed = await config(['unset', 'REDIRECT_URI']);
    expect(removed.exitCode).toBe(0);
    expect(removed.message).toContain('Removed REDIRECT_URI');
    expect(stored()).toEqual({ CLIENT_SECRET: 'x' });
    expect(Object.hasOwn(stored(), 'REDIRECT_URI')).toBe(false);

    const again = await config(['unset', 'REDIRECT_URI']);
    expect(again.exitCode).toBe(0);
    expect(again.message).toContain('REDIRECT_URI was not set');

    expect((await config(['unset'])).exitCode).toBe(2);
    expect((await config(['unset', 'KEY:value'])).exitCode).toBe(2);
  });

  it('[STADMIN-AC-12] unset removes a secret of an Installation', async () => {
    await withApp({ type: 'api-key', installationSecrets: ['ACCESS_TOKEN'] });
    const ctx = workspace.ctx();
    const installed = await handleInstall(
      { type: 'install', appId: APP, alias: 'example' },
      { ctx, options: options({ yes: true }) },
    );
    expect(installed.error).toBeUndefined();

    const byAlias = (args: string[]) =>
      handleConfig({ type: 'config', appId: 'example', args }, { ctx, options: options() });
    const set = await byAlias(['ACCESS_TOKEN:"t"']);
    expect(set.message).toContain('Configured 1 Installation secret(s) for example');
    const dir = join(workspace.dir, '.agentapps', 'installation-secrets');
    const { readdirSync } = await import('node:fs');
    const file = join(dir, readdirSync(dir)[0] as string);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ ACCESS_TOKEN: 't' });

    const unset = await byAlias(['unset', 'ACCESS_TOKEN']);
    expect(unset.message).toContain('Removed ACCESS_TOKEN from example');
    expect(existsSync(file)).toBe(false);
    expect((await byAlias(['OTHER:"x"'])).error?.message).toContain(
      'Unexpected Installation secret(s): OTHER',
    );
  });
});
