/**
 * Tests for scaffolding logic: rendering, both modes, and the generated files.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { safeParseAppManifest } from '@agentapps/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  copyTemplate,
  findRepoRoot,
  registerInExampleConfig,
  renderTemplate,
  scaffoldApp,
  tsLiteral,
} from '../src/scaffold.js';

/** A directory that looks like the agentapps monorepo to findRepoRoot(). */
function fakeRepo(dir: string): string {
  mkdirSync(join(dir, 'apps'), { recursive: true });
  mkdirSync(join(dir, 'packages', 'sdk'), { recursive: true });
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
  writeFileSync(join(dir, 'packages', 'sdk', 'package.json'), '{"name":"@agentapps/sdk"}');
  writeFileSync(join(dir, 'tsconfig.base.json'), '{}');
  writeFileSync(
    join(dir, 'agentapps.example.json'),
    '{\n  "apps": [\n    { "source": "./apps/hello" },\n    { "source": "./apps/last" }\n  ]\n}\n',
  );
  return dir;
}

describe('scaffoldApp', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'create-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a standalone project with a valid manifest outside the monorepo', async () => {
    const result = await scaffoldApp({
      projectName: 'test-app',
      cwd: tmpDir,
      mode: 'standalone',
      skipInstall: true,
      skipGit: true,
    });

    expect(result.mode).toBe('standalone');
    expect(result.destDir).toBe(join(tmpDir, 'test-app'));
    for (const file of [
      'agentapp.json',
      'package.json',
      'tsconfig.json',
      'biome.json',
      '.gitignore',
      'README.md',
      'src/app.ts',
      'src/lib/client.ts',
      'src/tools/index.ts',
      'src/tools/get-example.ts',
      'test/harness.ts',
      'test/manifest.test.ts',
      'test/tools.test.ts',
    ]) {
      expect(existsSync(join(result.destDir, file)), file).toBe(true);
    }

    const manifest = JSON.parse(readFileSync(join(result.destDir, 'agentapp.json'), 'utf-8'));
    expect(safeParseAppManifest(manifest).success).toBe(true);
    expect(manifest.id).toBe('app.test-app');

    // A standalone project must install from the registry: no workspace protocol.
    const pkg = readFileSync(join(result.destDir, 'package.json'), 'utf-8');
    expect(pkg).not.toContain('workspace:');
    // Real semver ranges, not a 'latest' fallback.
    for (const dep of ['@agentapps/sdk', '@agentapps/protocol', '@agentapps/station']) {
      const all = { ...JSON.parse(pkg).dependencies, ...JSON.parse(pkg).devDependencies };
      expect(all[dep], dep).toMatch(/^\^\d+\.\d+\.\d+/);
    }
    const parsed = JSON.parse(pkg);
    expect(parsed.scripts.check).toBe('create-agent-app check-app');
    // The broken experimental pack command is not advertised in generated projects.
    expect(parsed.scripts.pack).toBeUndefined();
    // The CLI for live tests comes with the project (never the unscoped `agentapps` package).
    expect(parsed.devDependencies['@agentapps/cli']).toMatch(/^\^\d/);
    expect(parsed.files).toEqual(['src', 'assets', 'agentapp.json', 'README.md']);
    // pnpm 11+ reads build permissions from pnpm-workspace.yaml and warns about a "pnpm" field.
    expect(parsed.pnpm).toBeUndefined();
    expect(readFileSync(join(result.destDir, 'pnpm-workspace.yaml'), 'utf-8')).toContain(
      'allowBuilds:\n  esbuild: true',
    );
  });

  it('writes into apps/<id> and registers the app in repo mode', async () => {
    const repo = fakeRepo(tmpDir);
    const result = await scaffoldApp({
      projectName: 'weather',
      cwd: join(repo, 'apps'),
      skipInstall: true,
      skipGit: true,
    });

    expect(result.mode).toBe('repo');
    expect(result.destDir).toBe(join(repo, 'apps', 'weather'));
    expect(result.registered).toBe(true);
    const example = JSON.parse(readFileSync(join(repo, 'agentapps.example.json'), 'utf-8'));
    expect(example.apps.at(-1)).toEqual({ source: './apps/weather' });

    const pkg = JSON.parse(readFileSync(join(result.destDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('@agentapps/example-weather');
    expect(pkg.dependencies['@agentapps/sdk']).toBe('workspace:*');
    const tsconfig = JSON.parse(readFileSync(join(result.destDir, 'tsconfig.json'), 'utf-8'));
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
    expect(existsSync(join(result.destDir, 'biome.json'))).toBe(false);
    // Standalone-only setup text does not leak into monorepo apps.
    expect(readFileSync(join(result.destDir, 'README.md'), 'utf-8')).not.toContain(
      '@agentapps/cli',
    );
  });

  it('uses --package-name for the npm name', async () => {
    const result = await scaffoldApp({
      projectName: 'named',
      packageName: '@acme/agentapp-named',
      cwd: tmpDir,
      mode: 'standalone',
      skipInstall: true,
      skipGit: true,
    });
    const pkg = JSON.parse(readFileSync(join(result.destDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('@acme/agentapp-named');
  });

  it('generates the manifest and the createApp() config from the same data', async () => {
    const result = await scaffoldApp({
      projectName: 'crm',
      cwd: tmpDir,
      mode: 'standalone',
      auth: 'api-key',
      secrets: ['CRM_API_KEY'],
      baseUrl: 'https://api.crm.example/v2/',
      skipInstall: true,
      skipGit: true,
    });
    const manifest = JSON.parse(readFileSync(join(result.destDir, 'agentapp.json'), 'utf-8'));
    const appTs = readFileSync(join(result.destDir, 'src/app.ts'), 'utf-8');
    expect(manifest.auth).toEqual({ type: 'api-key', installationSecrets: ['CRM_API_KEY'] });
    expect(appTs).toContain(tsLiteral(manifest));
    const client = readFileSync(join(result.destDir, 'src/lib/client.ts'), 'utf-8');
    expect(client).toContain("BASE_URL = 'https://api.crm.example/v2'");
    expect(client).toContain('getSecrets');
    expect(readFileSync(join(result.destDir, 'README.md'), 'utf-8')).toContain(
      'agentapps config crm CRM_API_KEY:"<value>"',
    );
  });

  it('writes an oauth2 app whose token refresh belongs to the host', async () => {
    const result = await scaffoldApp({
      projectName: 'search-console',
      appId: 'app.google.search-console',
      cwd: tmpDir,
      mode: 'standalone',
      auth: 'oauth2',
      provider: 'google',
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      skipInstall: true,
      skipGit: true,
    });
    expect(result.destDir).toBe(join(tmpDir, 'search-console'));
    const manifest = JSON.parse(readFileSync(join(result.destDir, 'agentapp.json'), 'utf-8'));
    expect(safeParseAppManifest(manifest).success).toBe(true);
    expect(manifest.id).toBe('app.google.search-console');
    expect(manifest.auth).toEqual({
      type: 'oauth2',
      provider: 'google',
      systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'],
      installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EXPIRY_DATE'],
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      pkce: false,
    });
    const client = readFileSync(join(result.destDir, 'src/lib/client.ts'), 'utf-8');
    expect(client).toContain('ctx.auth.refresh()');
    expect(client).toContain('agentapps config app.google.search-console CLIENT_ID');
    expect(client).not.toContain('REQUIRED_SECRETS');
    const readme = readFileSync(join(result.destDir, 'README.md'), 'utf-8');
    expect(readme).toContain('agentapps install app.google.search-console search-console');
    expect(readme).toContain('agentapps search-console auth');
    for (const file of [
      'src/app.ts',
      'src/lib/client.ts',
      'test/harness.ts',
      'test/tools.test.ts',
    ]) {
      expect(readFileSync(join(result.destDir, file), 'utf-8'), file).not.toMatch(/\{\{|\}\}/);
    }
  });

  it('checks api-key system secrets in the client and documents them on the app id', async () => {
    const result = await scaffoldApp({
      projectName: 'ads',
      cwd: tmpDir,
      mode: 'standalone',
      auth: 'api-key',
      secrets: ['ADS_ACCESS_TOKEN'],
      systemSecrets: ['ADS_APP_ID'],
      skipInstall: true,
      skipGit: true,
    });
    const manifest = JSON.parse(readFileSync(join(result.destDir, 'agentapp.json'), 'utf-8'));
    expect(manifest.auth).toEqual({
      type: 'api-key',
      systemSecrets: ['ADS_APP_ID'],
      installationSecrets: ['ADS_ACCESS_TOKEN'],
    });
    const client = readFileSync(join(result.destDir, 'src/lib/client.ts'), 'utf-8');
    expect(client).toContain('getSystemSecrets');
    const readme = readFileSync(join(result.destDir, 'README.md'), 'utf-8');
    expect(readme).toContain('agentapps config app.ads ADS_APP_ID:"<value>"');
    expect(readme).toContain('agentapps config ads ADS_ACCESS_TOKEN:"<value>"');
  });

  it('leaves the secrets code out of a no-auth api app', async () => {
    const result = await scaffoldApp({
      projectName: 'public-data',
      cwd: tmpDir,
      mode: 'standalone',
      skipInstall: true,
      skipGit: true,
    });
    const client = readFileSync(join(result.destDir, 'src/lib/client.ts'), 'utf-8');
    const app = readFileSync(join(result.destDir, 'src/app.ts'), 'utf-8');
    expect(client).not.toContain('getSecrets');
    expect(app).not.toContain('MISSING_SECRET');
    expect(app).not.toMatch(/\{\{|\}\}/);
  });

  it('treats typescript as an alias of minimal', async () => {
    const result = await scaffoldApp({
      projectName: 'ts-app',
      template: 'typescript',
      cwd: tmpDir,
      mode: 'standalone',
      skipInstall: true,
      skipGit: true,
    });
    expect(existsSync(join(result.destDir, 'src/tools/hello.ts'))).toBe(true);
  });

  it('rejects invalid input', async () => {
    const base = { cwd: tmpDir, mode: 'standalone' as const, skipInstall: true, skipGit: true };
    await expect(scaffoldApp({ ...base, projectName: '123-invalid' })).rejects.toThrow(
      'Project name must be kebab-case',
    );
    await expect(
      scaffoldApp({ ...base, projectName: 'a', auth: 'api-key', secrets: [] }),
    ).rejects.toThrow('needs at least one secret');
    await expect(
      scaffoldApp({ ...base, projectName: 'b', auth: 'api-key', secrets: ['lower'] }),
    ).rejects.toThrow('UPPER_SNAKE_CASE');
    await expect(
      scaffoldApp({ ...base, projectName: 'c', template: 'minimal', auth: 'api-key' }),
    ).rejects.toThrow('api template only');
    await expect(
      scaffoldApp({ ...base, projectName: 'd', auth: 'oauth2', scopes: ['s'] }),
    ).rejects.toThrow('needs --provider');
    await expect(
      scaffoldApp({ ...base, projectName: 'e', auth: 'oauth2', provider: 'acme', scopes: ['s'] }),
    ).rejects.toThrow('--authorize-url and --token-url');
    await expect(
      scaffoldApp({ ...base, projectName: 'f', auth: 'oauth2', provider: 'google' }),
    ).rejects.toThrow('at least one scope');
    await expect(
      scaffoldApp({ ...base, projectName: 'g', auth: 'api-key', secrets: ['K'], scopes: ['s'] }),
    ).rejects.toThrow('need --auth oauth2');
    await expect(scaffoldApp({ ...base, projectName: 'h', appId: 'google.ads' })).rejects.toThrow(
      'App id must be',
    );
    mkdirSync(join(tmpDir, 'existing-app'));
    await expect(scaffoldApp({ ...base, projectName: 'existing-app' })).rejects.toThrow(
      'Directory already exists',
    );
  });
});

describe('helpers', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'create-helpers-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders placeholders and conditional sections', () => {
    const text =
      'a {{X}}\n{{#ON}}\nkept\n{{/ON}}\n{{#OFF}}\ndropped\n{{/OFF}}\n{{^OFF}}\ninverse\n{{/OFF}}\nend {{UNKNOWN}}';
    expect(renderTemplate(text, { X: '1' }, { ON: true, OFF: false })).toBe(
      'a 1\nkept\ninverse\nend {{UNKNOWN}}',
    );
    expect(renderTemplate('import { a{{#ON}}, b{{/ON}} }', {}, { ON: false })).toBe('import { a }');
  });

  it('copies a template tree and drops the .tmpl suffix', () => {
    const src = join(tmpDir, 'src');
    mkdirSync(join(src, 'nested'), { recursive: true });
    writeFileSync(join(src, 'nested', 'app.ts.tmpl'), "const name = '{{ID}}';");
    copyTemplate(src, join(tmpDir, 'dest'), { ID: 'my-project' });
    expect(readFileSync(join(tmpDir, 'dest', 'nested', 'app.ts'), 'utf-8')).toBe(
      "const name = 'my-project';",
    );
  });

  it('finds the repo root from a nested directory, and nothing outside it', () => {
    const repo = fakeRepo(tmpDir);
    mkdirSync(join(repo, 'apps', 'x', 'src'), { recursive: true });
    expect(findRepoRoot(join(repo, 'apps', 'x', 'src'))).toBe(repo);
    expect(findRepoRoot(tmpdir())).toBeNull();
  });

  it('registers an app once, after the entry that sorts just before it', () => {
    const repo = fakeRepo(tmpDir);
    const read = () => readFileSync(join(repo, 'agentapps.example.json'), 'utf-8');
    expect(registerInExampleConfig(repo, 'new-app')).toBe(true);
    expect(registerInExampleConfig(repo, 'new-app')).toBe(false);
    expect(read()).toContain(
      '    { "source": "./apps/last" },\n    { "source": "./apps/new-app" }\n',
    );
    // In the middle: one new line, no neighbour touched.
    registerInExampleConfig(repo, 'ice');
    expect(read()).toContain(
      '    { "source": "./apps/hello" },\n    { "source": "./apps/ice" },\n    { "source": "./apps/last" },',
    );
    // Sorting before every entry: it goes first.
    registerInExampleConfig(repo, 'abc');
    expect(read()).toContain(
      '"apps": [\n    { "source": "./apps/abc" },\n    { "source": "./apps/hello" },',
    );
    expect(JSON.parse(read()).apps).toHaveLength(5);
  });

  it('renders TypeScript literals with single quotes and bare keys', () => {
    expect(tsLiteral({ a: "it's", 'b-c': [1, 'x'], d: { e: true } })).toBe(
      "{\n  a: 'it\\'s',\n  'b-c': [1, 'x'],\n  d: {\n    e: true,\n  },\n}",
    );
  });
});
