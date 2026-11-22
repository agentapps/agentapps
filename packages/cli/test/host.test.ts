/**
 * @agentapps/cli — host tests
 *
 * Covers system secret resolution, user secret persistence, and OAuth URL
 * generation for the CLI development host.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCliHostRequestHandlers,
  deriveInstallationId,
  InstallationSecretsStore,
  openUrl,
  readLine,
  requestSecret,
  resolveInstallationSecretsPath,
} from '../src/host.js';
import { appSecretsPath } from '../src/secrets-store.js';
import type { ResolvedApp } from '../src/types.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'agentapps-cli-host-'));
}

function makeApp(sourcePath: string, manifest?: Record<string, unknown>): ResolvedApp {
  return {
    name: 'test',
    sourcePath: resolve(sourcePath),
    env: {},
    factory: () => {},
    manifest: { id: 'app.test', version: '1.0.0', ...manifest },
  };
}

describe('createCliHostRequestHandlers', () => {
  let tmpDir: string;
  let configPath: string;
  let app: ResolvedApp;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    configPath = join(tmpDir, 'agentapps.json');
    writeFileSync(configPath, JSON.stringify({ apps: {} }), 'utf8');
    app = makeApp(join(tmpDir, 'app'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function writeSystemSecrets(secrets: Record<string, string>): void {
    mkdirSync(dirname(appSecretsPath(configPath, 'app.test')), { recursive: true });
    writeFileSync(appSecretsPath(configPath, 'app.test'), JSON.stringify(secrets), 'utf8');
  }

  it('resolves system secrets from .secrets/apps/<appId>.json', async () => {
    writeSystemSecrets({ HELLO: 'world' });
    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });
    const secrets = await requests.onGetSystemSecrets?.('sess', 'req');
    expect(secrets).toEqual({ HELLO: 'world' });
  });

  it('reads installation secrets from .agentapps/installation-secrets.json', async () => {
    const secretsDir = join(tmpDir, '.agentapps');
    mkdirSync(secretsDir, { recursive: true });
    writeFileSync(
      join(secretsDir, 'installation-secrets.json'),
      JSON.stringify({ TOKEN: 'abc' }),
      'utf8',
    );

    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });
    const secrets = await requests.onGetInstallationSecrets?.('sess', 'req');
    expect(secrets).toEqual({ TOKEN: 'abc' });
  });

  it('updates installation secrets on disk', async () => {
    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });

    const ok = await requests.onUpdateInstallationSecrets?.('sess', 'req', { TOKEN: 'xyz' });
    expect(ok).toBe(true);

    const path = resolveInstallationSecretsPath(configPath);
    const raw = readFileSync(path, 'utf8');
    expect(JSON.parse(raw)).toEqual({ TOKEN: 'xyz' });

    await requests.onUpdateInstallationSecrets?.('sess', 'req', { REFRESH: 'rrr' });
    const updated = JSON.parse(readFileSync(path, 'utf8'));
    expect(updated).toEqual({ TOKEN: 'xyz', REFRESH: 'rrr' });
  });

  it('returns empty system secrets when nothing is configured', async () => {
    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });
    const secrets = await requests.onGetSystemSecrets?.('sess', 'req');
    expect(secrets).toEqual({});
  });

  it('returns unauthenticated auth status when no tokens are stored', async () => {
    app = makeApp(join(tmpDir, 'app'), {
      auth: { type: 'oauth2', provider: 'google', scopes: ['calendar'] },
    });
    writeSystemSecrets({
      GOOGLE_AUTHORIZE_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
      GOOGLE_CLIENT_ID: 'client-id',
    });
    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });
    const status = await requests.onAuthStatus?.('sess', 'req');
    expect(status).toEqual({
      authenticated: false,
      authRequired: true,
      provider: 'google',
      scopes: ['calendar'],
      authUrl: expect.stringContaining('accounts.google.com'),
    });
  });

  it('returns authenticated auth status when a valid non-expired token is stored', async () => {
    app = makeApp(join(tmpDir, 'app'), {
      auth: { type: 'oauth2', provider: 'google', scopes: ['calendar'] },
    });
    const secretsDir = join(tmpDir, '.agentapps');
    mkdirSync(secretsDir, { recursive: true });
    const future = new Date(Date.now() + 3600_000).toISOString();
    writeFileSync(
      join(secretsDir, 'installation-secrets.json'),
      JSON.stringify({ ACCESS_TOKEN: 'valid_token', expiresAt: future }),
      'utf8',
    );

    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });
    const status = await requests.onAuthStatus?.('sess', 'req');
    expect(status).toEqual({
      authenticated: true,
      provider: 'google',
      scopes: ['calendar'],
      expiresAt: future,
    });
  });

  it('returns unauthenticated auth status when the stored token has expired', async () => {
    app = makeApp(join(tmpDir, 'app'), {
      auth: { type: 'oauth2', provider: 'google', scopes: ['calendar'] },
    });
    const secretsDir = join(tmpDir, '.agentapps');
    mkdirSync(secretsDir, { recursive: true });
    const past = new Date(Date.now() - 1).toISOString();
    writeFileSync(
      join(secretsDir, 'installation-secrets.json'),
      JSON.stringify({ ACCESS_TOKEN: 'expired_token', expiresAt: past }),
      'utf8',
    );
    writeSystemSecrets({
      GOOGLE_AUTHORIZE_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
      GOOGLE_CLIENT_ID: 'client-id',
    });

    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });
    const status = await requests.onAuthStatus?.('sess', 'req');
    expect(status).toEqual({
      authenticated: false,
      authRequired: true,
      provider: 'google',
      scopes: ['calendar'],
      expiresAt: past,
      authUrl: expect.stringContaining('accounts.google.com'),
    });
  });

  it('reports authenticated when the access token expired but a refresh token is present', async () => {
    app = makeApp(join(tmpDir, 'app'), {
      auth: { type: 'oauth2', provider: 'google', scopes: ['calendar'] },
    });
    const secretsDir = join(tmpDir, '.agentapps');
    mkdirSync(secretsDir, { recursive: true });
    const past = new Date(Date.now() - 1).toISOString();
    writeFileSync(
      join(secretsDir, 'installation-secrets.json'),
      JSON.stringify({ ACCESS_TOKEN: 'expired_token', REFRESH_TOKEN: 'rt', expiresAt: past }),
      'utf8',
    );

    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });
    const status = await requests.onAuthStatus?.('sess', 'req');
    // Refreshable → the pre-flight gate must let the call through; the actual
    // refresh happens lazily via ctx.auth.refresh() during the tool call.
    expect(status?.authenticated).toBe(true);
    expect(status?.authRequired).toBeUndefined();
  });

  it('builds a generic OAuth URL from configured system secrets', async () => {
    writeSystemSecrets({
      GOOGLE_AUTHORIZE_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
      GOOGLE_CLIENT_ID: 'client-id',
    });
    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });
    const result = await requests.onAuthUrl?.('sess', 'req', 'google', ['calendar']);
    expect(result).toBeDefined();
    expect(result?.url).toContain('accounts.google.com');
    expect(result?.url).toContain('client_id=client-id');
    expect(result?.url).toContain('scope=calendar');
    expect(result?.state).toHaveLength(32);
  });

  it('builds a GitHub App setup URL when GITHUB_APP_ID is available', async () => {
    writeSystemSecrets({ GITHUB_APP_ID: 'my-app' });
    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });
    const result = await requests.onAuthUrl?.('sess', 'req', 'github');
    expect(result?.url).toBe('https://github.com/apps/my-app/installations/new');
    expect(result?.state).toHaveLength(32);
  });

  it('returns empty auth URL when required system secrets are missing', async () => {
    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });
    const result = await requests.onAuthUrl?.('sess', 'req', 'google');
    expect(result?.url).toBe('');
    expect(result?.state).toHaveLength(32);
  });

  it('refreshes tokens and persists them to installation secrets', async () => {
    const captured: { url?: string; body?: URLSearchParams } = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        captured.url = url;
        captured.body = new URLSearchParams(init.body as string);
        return new Response(
          JSON.stringify({
            access_token: 'new_access_token',
            refresh_token: 'new_refresh_token',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const secretsDir = join(tmpDir, '.agentapps');
    mkdirSync(secretsDir, { recursive: true });
    writeFileSync(
      join(secretsDir, 'installation-secrets.json'),
      JSON.stringify({ REFRESH_TOKEN: 'old_rt' }),
      'utf8',
    );

    writeSystemSecrets({
      tokenUrl: 'https://provider.example.com/oauth/token',
      CLIENT_ID: 'client_id',
      CLIENT_SECRET: 'client_secret',
    });

    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });

    const result = await requests.onRefreshToken?.('sess', 'req');
    expect(result).toEqual({
      accessToken: 'new_access_token',
      refreshToken: 'new_refresh_token',
      expiresAt: expect.any(String),
    });

    expect(captured.url).toBe('https://provider.example.com/oauth/token');
    expect(captured.body?.get('grant_type')).toBe('refresh_token');
    expect(captured.body?.get('refresh_token')).toBe('old_rt');
    expect(captured.body?.get('client_id')).toBe('client_id');
    expect(captured.body?.get('client_secret')).toBe('client_secret');

    const persisted = JSON.parse(readFileSync(resolveInstallationSecretsPath(configPath), 'utf8'));
    expect(persisted.ACCESS_TOKEN).toBe('new_access_token');
    expect(persisted.REFRESH_TOKEN).toBe('new_refresh_token');
    expect(persisted.expiresAt).toBe(result?.expiresAt);
  });

  it('reuses the existing refresh token when the endpoint does not return a new one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ access_token: 'new_access_token', expires_in: 7200 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const secretsDir = join(tmpDir, '.agentapps');
    mkdirSync(secretsDir, { recursive: true });
    writeFileSync(
      join(secretsDir, 'installation-secrets.json'),
      JSON.stringify({ REFRESH_TOKEN: 'existing_rt' }),
      'utf8',
    );

    writeSystemSecrets({
      tokenUrl: 'https://provider.example.com/oauth/token',
      CLIENT_ID: 'client_id',
      CLIENT_SECRET: 'client_secret',
    });

    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });

    const result = await requests.onRefreshToken?.('sess', 'req');
    expect(result?.refreshToken).toBe('existing_rt');

    const persisted = JSON.parse(readFileSync(resolveInstallationSecretsPath(configPath), 'utf8'));
    expect(persisted.REFRESH_TOKEN).toBe('existing_rt');
  });

  it('throws when system secrets are missing for refresh', async () => {
    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });
    await expect(requests.onRefreshToken?.('sess', 'req')).rejects.toThrow(
      'Missing system secret: tokenUrl',
    );
  });

  it('throws when user refresh token is missing', async () => {
    writeSystemSecrets({
      tokenUrl: 'https://provider.example.com/oauth/token',
      CLIENT_ID: 'client_id',
      CLIENT_SECRET: 'client_secret',
    });

    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });
    await expect(requests.onRefreshToken?.('sess', 'req')).rejects.toThrow(
      'Missing Installation secret: REFRESH_TOKEN',
    );
  });

  it('throws when the token endpoint returns an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      }),
    );

    const secretsDir = join(tmpDir, '.agentapps');
    mkdirSync(secretsDir, { recursive: true });
    writeFileSync(
      join(secretsDir, 'installation-secrets.json'),
      JSON.stringify({ REFRESH_TOKEN: 'old_rt' }),
      'utf8',
    );

    writeSystemSecrets({
      tokenUrl: 'https://provider.example.com/oauth/token',
      CLIENT_ID: 'client_id',
      CLIENT_SECRET: 'client_secret',
    });

    const requests = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
    });

    await expect(requests.onRefreshToken?.('sess', 'req')).rejects.toThrow(
      'Token refresh failed: 400',
    );
  });
});

describe('InstallationSecretsStore', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    configPath = join(tmpDir, 'agentapps.json');
    writeFileSync(configPath, '{}');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('clear() removes stored secrets and reports removal', () => {
    const store = new InstallationSecretsStore(configPath, 'ins_test');
    store.merge({ ACCESS_TOKEN: 'tok', REFRESH_TOKEN: 'ref' });
    expect(store.read()).toEqual({ ACCESS_TOKEN: 'tok', REFRESH_TOKEN: 'ref' });

    expect(store.clear()).toBe(true);
    expect(store.read()).toEqual({});
  });

  it('clear() returns false when nothing is stored', () => {
    const store = new InstallationSecretsStore(configPath, 'ins_empty');
    expect(store.clear()).toBe(false);
  });

  it('clear() does not affect other installations', () => {
    const a = new InstallationSecretsStore(configPath, 'ins_a');
    const b = new InstallationSecretsStore(configPath, 'ins_b');
    a.merge({ ACCESS_TOKEN: 'a' });
    b.merge({ ACCESS_TOKEN: 'b' });

    a.clear();
    expect(a.read()).toEqual({});
    expect(b.read()).toEqual({ ACCESS_TOKEN: 'b' });
  });
});

describe('deriveInstallationId', () => {
  it('returns a stable hash for a source path', () => {
    const id1 = deriveInstallationId('/foo/bar');
    const id2 = deriveInstallationId('/foo/bar');
    expect(id1).toBe(id2);
    expect(id1.startsWith('cli_')).toBe(true);
  });
});

describe('readLine', () => {
  it('reads and trims a line from a stream', async () => {
    const input = new Readable({ read() {} });
    input.push('  pasted-code  \n');
    input.push(null);
    const line = await readLine(input);
    expect(line).toBe('pasted-code');
  });

  it('resolves empty when the stream closes without a line', async () => {
    const input = new Readable({ read() {} });
    input.push(null);
    const line = await readLine(input);
    expect(line).toBe('');
  });
});

describe('openUrl', () => {
  // Note: the happy path is only exercised with an injected launcher — calling
  // openUrl with the default launcher would open a real browser during tests.
  it('logs the title and highlighted URL exactly once, then launches', async () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const launcher = vi.fn().mockResolvedValue(undefined);

    await expect(
      openUrl('https://example.com', 'Open this link', launcher, true),
    ).resolves.toBeUndefined();

    expect(launcher).toHaveBeenCalledWith(expect.any(String), 'https://example.com');
    expect(stderrSpy).toHaveBeenCalledWith('[cli] Open this link');
    expect(stderrSpy).toHaveBeenCalledWith('[cli] Opening your browser to continue:');
    const urlLines = stderrSpy.mock.calls.filter((c) =>
      String(c[0]).includes('https://example.com'),
    );
    expect(urlLines).toHaveLength(1);

    stderrSpy.mockRestore();
  });

  it('does not repeat the URL when the browser command fails', async () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const launcher = vi.fn().mockRejectedValue(new Error('Command not found'));

    await expect(
      openUrl('https://example.com', undefined, launcher, true),
    ).resolves.toBeUndefined();
    expect(stderrSpy).toHaveBeenCalledWith(
      '[cli] Could not open the browser automatically — use the URL above.',
    );
    const urlLines = stderrSpy.mock.calls.filter((c) =>
      String(c[0]).includes('https://example.com'),
    );
    expect(urlLines).toHaveLength(1);

    stderrSpy.mockRestore();
  });

  it('skips the launcher entirely when no browser is available', async () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const launcher = vi.fn().mockResolvedValue(undefined);

    await expect(
      openUrl('https://example.com', 'Authenticate calendar', launcher, false),
    ).resolves.toBeUndefined();

    expect(launcher).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(
      '[cli] No browser available on this machine — open this URL from any device:',
    );
    const urlLines = stderrSpy.mock.calls.filter((c) =>
      String(c[0]).includes('https://example.com'),
    );
    expect(urlLines).toHaveLength(1);

    stderrSpy.mockRestore();
  });
});

describe('requestSecret', () => {
  it('reads a secret value from stdin', async () => {
    const stdin = new Readable({ read() {} });
    stdin.push('my-secret-value\n');
    stdin.push(null);

    const originalStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });

    const result = await requestSecret('API_KEY', 'Enter your API key');
    expect(result).toBe('my-secret-value');

    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
  });

  it('returns null for empty input', async () => {
    const stdin = new Readable({ read() {} });
    stdin.push('\n');
    stdin.push(null);

    const originalStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });

    const result = await requestSecret('API_KEY');
    expect(result).toBeNull();

    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
  });
});

describe('Protocol file requests (file_volume_*)', () => {
  let tmpDir: string;
  let configPath: string;
  let app: ResolvedApp;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    configPath = join(tmpDir, 'agentapps.json');
    writeFileSync(configPath, JSON.stringify({ apps: {} }), 'utf8');
    app = makeApp(join(tmpDir, 'app'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // Helper: build requests with a default installationId
  function makeCallbacks(opts?: { publicUrl?: string }) {
    return createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
      installationId: 'inst_test',
      publicUrl: opts?.publicUrl ?? 'http://localhost:9999',
      permissions: { volume: true },
    });
  }

  // --- file_volume_* tests ---

  it('file_volume_write_file writes content to disk', async () => {
    const requests = makeCallbacks();
    const msg = {
      type: 'file_volume_write_file',
      requestId: 'cb1',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: 'test.txt',
      data: Buffer.from('hola-mundo').toString('base64'),
    };
    const result = await requests.onFileRequest?.('sess1', msg);
    expect(result?.success).toBe(true);
    expect(result?.type).toBe('file_volume_write_file_result');
  });

  it('file_volume_read_file returns the written content', async () => {
    const requests = makeCallbacks();
    // First write
    await requests.onFileRequest?.('sess1', {
      type: 'file_volume_write_file',
      requestId: 'cb1',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: 'test.txt',
      data: Buffer.from('hola-mundo').toString('base64'),
    });
    // Then read
    const result = await requests.onFileRequest?.('sess1', {
      type: 'file_volume_read_file',
      requestId: 'cb2',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: 'test.txt',
    });
    expect(result?.success).toBe(true);
    expect(result?.type).toBe('file_volume_read_file_result');
    expect(result?.data).toBe(Buffer.from('hola-mundo').toString('base64'));
    expect(Buffer.from(result?.data, 'base64').toString('utf8')).toBe('hola-mundo');
  });

  it('file_volume_read_file fails for non-existent file', async () => {
    const requests = makeCallbacks();
    const result = await requests.onFileRequest?.('sess1', {
      type: 'file_volume_read_file',
      requestId: 'cb1',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: 'nope.txt',
    });
    expect(result?.success).toBe(false);
    expect(result?.error).toBeTruthy();
  });

  it('file_volume_read_dir lists directory entries', async () => {
    const requests = makeCallbacks();
    // Write two files
    await requests.onFileRequest?.('sess1', {
      type: 'file_volume_write_file',
      requestId: 'cb1',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: 'a.txt',
      data: Buffer.from('a').toString('base64'),
    });
    await requests.onFileRequest?.('sess1', {
      type: 'file_volume_write_file',
      requestId: 'cb2',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: 'b.txt',
      data: Buffer.from('b').toString('base64'),
    });
    // Read dir
    const result = await requests.onFileRequest?.('sess1', {
      type: 'file_volume_read_dir',
      requestId: 'cb3',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: '',
    });
    expect(result?.success).toBe(true);
    expect(result?.entries).toHaveLength(2);
    const names = (result?.entries as Array<{ name: string }>).map((e) => e.name).sort();
    expect(names).toEqual(['a.txt', 'b.txt']);
  });

  it('file_volume_delete removes a file', async () => {
    const requests = makeCallbacks();
    // Write
    await requests.onFileRequest?.('sess1', {
      type: 'file_volume_write_file',
      requestId: 'cb1',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: 'delete-me.txt',
      data: Buffer.from('x').toString('base64'),
    });
    // Delete
    const result = await requests.onFileRequest?.('sess1', {
      type: 'file_volume_delete',
      requestId: 'cb2',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: 'delete-me.txt',
      recursive: false,
    });
    expect(result?.success).toBe(true);
    // Verify it's gone
    const readResult = await requests.onFileRequest?.('sess1', {
      type: 'file_volume_read_file',
      requestId: 'cb3',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: 'delete-me.txt',
    });
    expect(readResult?.success).toBe(false);
  });

  it('file_volume_stat returns file metadata', async () => {
    const requests = makeCallbacks();
    await requests.onFileRequest?.('sess1', {
      type: 'file_volume_write_file',
      requestId: 'cb1',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: 'stat-me.txt',
      data: Buffer.from('hello').toString('base64'),
    });
    const result = await requests.onFileRequest?.('sess1', {
      type: 'file_volume_stat',
      requestId: 'cb2',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: 'stat-me.txt',
    });
    expect(result?.success).toBe(true);
    expect(result?.stat?.type).toBe('file');
    expect(result?.stat?.size).toBe(5);
    expect(result?.stat?.path).toBe('stat-me.txt');
  });

  it('file_volume rejects path traversal (..)', async () => {
    const requests = makeCallbacks();
    const result = await requests.onFileRequest?.('sess1', {
      type: 'file_volume_read_file',
      requestId: 'cb1',
      sessionId: 'sess1',
      installationId: 'inst_test',
      workspaceId: 'ws_test',
      path: '../../../etc/passwd',
    });
    expect(result?.success).toBe(false);
    expect(result?.code).toBe('INVALID_ARGUMENTS');
  });
});

describe('Storage (onStoragePut / onStorageGet / onStorageQuery / onStorageUpdate / onStorageDelete)', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    configPath = join(tmpDir, 'agentapps.json');
    writeFileSync(configPath, JSON.stringify({ apps: {} }), 'utf8');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function callbacksFor(installationId: string) {
    const app = makeApp(join(tmpDir, 'app'));
    return createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
      installationId,
    });
  }

  it('persists documents per installation and collection under .agentapps/data/storage', async () => {
    const cb = callbacksFor('ins_a');
    await cb.onStoragePut!('s', 'ins_a', 'nodes', 'n1', { text: 'a', parentId: null });
    await cb.onStoragePut!('s', 'ins_a', 'nodes', 'n2', { text: 'b', parentId: 'n1' });
    expect(await cb.onStorageGet!('s', 'ins_a', 'nodes', 'n1')).toEqual({
      text: 'a',
      parentId: null,
    });

    const page = await cb.onStorageQuery!('s', 'ins_a', 'nodes', { filter: { parentId: 'n1' } });
    expect(page.documents).toEqual([{ text: 'b', parentId: 'n1' }]);

    expect(await cb.onStorageUpdate!('s', 'ins_a', 'nodes', 'n2', { done: true })).toEqual({
      text: 'b',
      parentId: 'n1',
      done: true,
    });
    expect(await cb.onStorageUpdate!('s', 'ins_a', 'nodes', 'nope', { done: true })).toBeNull();
    expect(await cb.onStorageDelete!('s', 'ins_a', 'nodes', 'n1')).toBe(true);

    const file = join(
      tmpDir,
      '.agentapps',
      'data',
      'storage',
      'ins_a',
      `${Buffer.from('nodes').toString('base64url')}.json`,
    );
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      n2: { text: 'b', parentId: 'n1', done: true },
    });

    // A fresh set of requests reads the same file back
    const again = callbacksFor('ins_a');
    expect(await again.onStorageGet!('s', 'ins_a', 'nodes', 'n2')).toEqual({
      text: 'b',
      parentId: 'n1',
      done: true,
    });
    // Other installations do not see it
    const other = callbacksFor('ins_b');
    expect(await other.onStorageGet!('s', 'ins_b', 'nodes', 'n2')).toBeNull();
  });
});

describe('Objects (onObjectPut / onObjectGet / onObjectDelete / onObjectList / onObjectLink)', () => {
  let tmpDir: string;
  let configPath: string;
  let app: ResolvedApp;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    configPath = join(tmpDir, 'agentapps.json');
    writeFileSync(configPath, JSON.stringify({ apps: {} }), 'utf8');
    app = makeApp(join(tmpDir, 'app'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeCallbacks() {
    return createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
      installationId: 'inst_test',
      publicUrl: 'http://localhost:9999',
    });
  }

  it('put stores the object on disk and returns a URL on the station', async () => {
    const requests = makeCallbacks();
    const info = await requests.onObjectPut!('sess1', 'inst_test', {
      data: Buffer.from('hello objects'),
      contentType: 'text/plain',
      filename: 'hello.txt',
      visibility: 'private',
    });
    expect(info.objectId).toMatch(/^obj_[0-9a-f]{32}$/);
    expect(info.url).toBe(`http://localhost:9999/objects/${info.objectId}`);
    expect(info.size).toBe('hello objects'.length);
    expect(info.visibility).toBe('private');
    const onDisk = readFileSync(
      join(tmpDir, '.agentapps/data', 'ws_default', 'objects', 'inst_test', info.objectId),
      'utf8',
    );
    expect(onDisk).toBe('hello objects');
  });

  it('get returns the content and metadata; unknown ids return null', async () => {
    const requests = makeCallbacks();
    const info = await requests.onObjectPut!('sess1', 'inst_test', {
      data: Buffer.from('payload'),
      contentType: 'application/octet-stream',
      visibility: 'private',
    });
    const found = await requests.onObjectGet!('sess1', 'inst_test', info.objectId);
    expect(found?.data.toString('utf8')).toBe('payload');
    expect(found?.contentType).toBe('application/octet-stream');
    expect(await requests.onObjectGet!('sess1', 'inst_test', 'obj_' + 'f'.repeat(32))).toBeNull();
  });

  it('list is newest first and paginates with a cursor', async () => {
    const requests = makeCallbacks();
    const ids: string[] = [];
    for (const text of ['one', 'two', 'three']) {
      const info = await requests.onObjectPut!('sess1', 'inst_test', {
        data: Buffer.from(text),
        contentType: 'text/plain',
        visibility: 'private',
      });
      ids.push(info.objectId);
      await new Promise((r) => setTimeout(r, 5));
    }
    const first = await requests.onObjectList!('sess1', 'inst_test', { limit: 2 });
    expect(first.objects.map((o) => o.objectId)).toEqual([ids[2], ids[1]]);
    expect(first.nextCursor).toBe(ids[1]);
    const rest = await requests.onObjectList!('sess1', 'inst_test', { cursor: first.nextCursor });
    expect(rest.objects.map((o) => o.objectId)).toEqual([ids[0]]);
    expect(rest.nextCursor).toBeUndefined();
  });

  it('link returns a signed URL that expires; delete removes the object', async () => {
    const requests = makeCallbacks();
    const info = await requests.onObjectPut!('sess1', 'inst_test', {
      data: Buffer.from('temp'),
      contentType: 'text/plain',
      visibility: 'private',
    });
    const link = await requests.onObjectLink!('sess1', 'inst_test', info.objectId, 600);
    expect(link?.url.startsWith(`${info.url}?token=`)).toBe(true);
    const secondsLeft = (new Date(link!.expiresAt).getTime() - Date.now()) / 1000;
    expect(secondsLeft).toBeGreaterThan(590);
    expect(secondsLeft).toBeLessThanOrEqual(600);

    expect(await requests.onObjectDelete!('sess1', 'inst_test', info.objectId)).toBe(true);
    expect(await requests.onObjectGet!('sess1', 'inst_test', info.objectId)).toBeNull();
    expect(await requests.onObjectDelete!('sess1', 'inst_test', info.objectId)).toBe(false);
  });

  it('another installation of the workspace can read but not delete', async () => {
    const requests = makeCallbacks();
    const info = await requests.onObjectPut!('sess1', 'inst_test', {
      data: Buffer.from('shared within workspace'),
      contentType: 'text/plain',
      visibility: 'private',
    });
    const other = createCliHostRequestHandlers({
      app,
      appEntry: { source: app.sourcePath, env: {} },
      configPath,
      installationId: 'inst_other',
      publicUrl: 'http://localhost:9999',
    });
    const found = await other.onObjectGet!('sess2', 'inst_other', info.objectId);
    expect(found?.data.toString('utf8')).toBe('shared within workspace');
    expect(await other.onObjectDelete!('sess2', 'inst_other', info.objectId)).toBe(false);
  });
});
