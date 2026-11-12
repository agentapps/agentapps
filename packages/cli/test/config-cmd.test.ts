/**
 * @agentapps/cli — config command tests
 *
 * Covers one-shot and interactive system-secret configuration for apps.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleConfig } from '../src/commands/config.js';
import { appSecretsPath } from '../src/secrets-store.js';
import type { CliContext, GlobalOptions, WorkspaceConfig } from '../src/types.js';

function makeCtx(tmpDir: string, config: WorkspaceConfig): CliContext {
  const configPath = join(tmpDir, 'agentapps.json');
  writeFileSync(configPath, JSON.stringify(config), 'utf8');
  return { cwd: tmpDir, config, configPath };
}

function defaultOptions(): GlobalOptions {
  return {
    json: false,
    yaml: false,
    raw: false,
    manualCode: false,
    urlOnly: false,
    yes: false,
    verbose: false,
    help: false,
  };
}

function createAppSource(tmpDir: string, appId: string, systemSecrets?: string[]): string {
  const source = join(tmpDir, appId);
  mkdirSync(source, { recursive: true });
  const manifest: Record<string, unknown> = {
    id: appId,
    version: '1.0.0',
    auth: systemSecrets ? { type: 'oauth2', provider: 'google', systemSecrets } : false,
  };
  writeFileSync(join(source, 'agentapp.json'), JSON.stringify(manifest), 'utf8');
  return source;
}

describe('config command', () => {
  let tmpDir: string;
  let ctx: CliContext;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentapps-config-cmd-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('configures all expected secrets in one-shot mode', async () => {
    const appId = 'app.example';
    const source = createAppSource(tmpDir, appId, ['CLIENT_ID', 'CLIENT_SECRET']);
    const config: WorkspaceConfig = { apps: { [appId]: { source } } };
    ctx = makeCtx(tmpDir, config);

    const result = await handleConfig(
      { type: 'config', appId, args: ['CLIENT_ID:"abc"', 'CLIENT_SECRET:"xyz"'] },
      { ctx, options: defaultOptions() },
    );

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data).toMatchObject({ appId, keys: ['CLIENT_ID', 'CLIENT_SECRET'] });

    const stored = JSON.parse(readFileSync(appSecretsPath(ctx.configPath, appId), 'utf8'));
    expect(stored).toEqual({ CLIENT_ID: 'abc', CLIENT_SECRET: 'xyz' });
  });

  it('rejects unknown keys in one-shot mode', async () => {
    const appId = 'app.example';
    const source = createAppSource(tmpDir, appId, ['CLIENT_ID']);
    const config: WorkspaceConfig = { apps: { [appId]: { source } } };
    ctx = makeCtx(tmpDir, config);

    const result = await handleConfig(
      { type: 'config', appId, args: ['CLIENT_ID:"abc"', 'UNKNOWN:"xyz"'] },
      { ctx, options: defaultOptions() },
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.error?.message).toContain('Unexpected secret(s): UNKNOWN');
  });

  it('allows partial updates in one-shot mode', async () => {
    const appId = 'app.example';
    const source = createAppSource(tmpDir, appId, ['CLIENT_ID', 'CLIENT_SECRET']);
    const config: WorkspaceConfig = { apps: { [appId]: { source } } };
    ctx = makeCtx(tmpDir, config);

    const result = await handleConfig(
      { type: 'config', appId, args: ['CLIENT_ID:"abc"'] },
      { ctx, options: defaultOptions() },
    );

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    const stored = JSON.parse(readFileSync(appSecretsPath(ctx.configPath, appId), 'utf8'));
    expect(stored.CLIENT_ID).toBe('abc');
  });

  it('rejects invalid key:value arguments', async () => {
    const appId = 'app.example';
    const source = createAppSource(tmpDir, appId, ['CLIENT_ID']);
    const config: WorkspaceConfig = { apps: { [appId]: { source } } };
    ctx = makeCtx(tmpDir, config);

    const result = await handleConfig(
      { type: 'config', appId, args: ['CLIENT_ID'] },
      { ctx, options: defaultOptions() },
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.error?.message).toContain('Invalid secret argument');
  });

  it('reports no system secrets when the app does not declare any', async () => {
    const appId = 'app.example';
    const source = createAppSource(tmpDir, appId);
    const config: WorkspaceConfig = { apps: { [appId]: { source } } };
    ctx = makeCtx(tmpDir, config);

    const result = await handleConfig(
      { type: 'config', appId, args: [] },
      { ctx, options: defaultOptions() },
    );

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('does not declare any system secrets');
  });

  it('returns an error when the app is not configured', async () => {
    ctx = makeCtx(tmpDir, { apps: {} });

    const result = await handleConfig(
      { type: 'config', appId: 'app.missing', args: [] },
      { ctx, options: defaultOptions() },
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.error?.message).toContain('App or instance not found');
  });

  it('prompts interactively for missing secrets', async () => {
    const appId = 'app.example';
    const source = createAppSource(tmpDir, appId, ['CLIENT_ID', 'CLIENT_SECRET']);
    const config: WorkspaceConfig = { apps: { [appId]: { source } } };
    ctx = makeCtx(tmpDir, config);

    // OAuth apps also get REDIRECT_URI as an infrastructure key, so 3 prompts.
    const input = new Readable({ read() {} });
    input.push('abc\n');
    input.push('xyz\n');
    input.push('http://localhost:8765/callback\n');
    input.push(null);

    const outputChunks: string[] = [];
    const output = new Writable({
      write(chunk, _encoding, request) {
        outputChunks.push(chunk.toString());
        request();
      },
    });

    const result = await handleConfig(
      { type: 'config', appId, args: [] },
      { ctx, options: defaultOptions(), input, output },
    );

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);

    const stored = JSON.parse(readFileSync(appSecretsPath(ctx.configPath, appId), 'utf8'));
    expect(stored.CLIENT_ID).toBe('abc');
    expect(stored.CLIENT_SECRET).toBe('xyz');
    expect(stored.REDIRECT_URI).toBe('http://localhost:8765/callback');

    const outputText = outputChunks.join('');
    expect(outputText).toContain('Enter CLIENT_ID:');
    expect(outputText).toContain('Enter CLIENT_SECRET:');
    expect(outputText).toContain('Enter REDIRECT_URI:');
  });

  it('merges interactive secrets with existing stored secrets', async () => {
    const appId = 'app.example';
    const source = createAppSource(tmpDir, appId, ['CLIENT_ID', 'CLIENT_SECRET']);
    const config: WorkspaceConfig = { apps: { [appId]: { source } } };
    ctx = makeCtx(tmpDir, config);

    mkdirSync(dirname(appSecretsPath(ctx.configPath, appId)), { recursive: true });
    writeFileSync(
      appSecretsPath(ctx.configPath, appId),
      JSON.stringify({ CLIENT_ID: 'old' }),
      'utf8',
    );

    // 3 prompts: CLIENT_ID, CLIENT_SECRET, REDIRECT_URI
    const input = new Readable({ read() {} });
    input.push('new\n');
    input.push('secret\n');
    input.push('http://localhost/cb\n');
    input.push(null);

    const output = new Writable({
      write(_chunk, _encoding, request) {
        request();
      },
    });

    const result = await handleConfig(
      { type: 'config', appId, args: [] },
      { ctx, options: defaultOptions(), input, output },
    );

    expect(result.success).toBe(true);
    const stored = JSON.parse(readFileSync(appSecretsPath(ctx.configPath, appId), 'utf8'));
    expect(stored.CLIENT_ID).toBe('new');
    expect(stored.CLIENT_SECRET).toBe('secret');
    expect(stored.REDIRECT_URI).toBe('http://localhost/cb');
  });
});
