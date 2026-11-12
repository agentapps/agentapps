/**
 * @agentapps/cli — secrets-store tests
 *
 * Covers loading, saving, and listing app-level system secrets.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appSecretsDir,
  appSecretsPath,
  listAppsWithSecrets,
  loadAppSecrets,
  saveAppSecrets,
} from '../src/secrets-store.js';

function makeTmpDir(): string {
  return mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'agentapps-secrets-'));
}

describe('secrets-store', () => {
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

  it('resolves the app secrets directory and path', () => {
    expect(appSecretsDir(configPath)).toBe(join(tmpDir, '.secrets', 'apps'));
    expect(appSecretsPath(configPath, 'app.example')).toBe(
      join(tmpDir, '.secrets', 'apps', 'app.example.json'),
    );
  });

  it('returns an empty record when no secrets file exists', () => {
    expect(loadAppSecrets(configPath, 'app.missing')).toEqual({});
  });

  it('loads string values from a secrets file', () => {
    saveAppSecrets(configPath, 'app.example', { KEY: 'value', NUMERIC: '123' });
    expect(loadAppSecrets(configPath, 'app.example')).toEqual({ KEY: 'value', NUMERIC: '123' });
  });

  it('merges new secrets with existing ones', () => {
    saveAppSecrets(configPath, 'app.example', { FIRST: 'one' });
    saveAppSecrets(configPath, 'app.example', { SECOND: 'two' });
    expect(loadAppSecrets(configPath, 'app.example')).toEqual({ FIRST: 'one', SECOND: 'two' });
  });

  it('overwrites existing keys when saving', () => {
    saveAppSecrets(configPath, 'app.example', { KEY: 'old' });
    saveAppSecrets(configPath, 'app.example', { KEY: 'new' });
    expect(loadAppSecrets(configPath, 'app.example')).toEqual({ KEY: 'new' });
  });

  it('ignores non-string values when loading', () => {
    const path = appSecretsPath(configPath, 'app.example');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ STR: 'ok', OBJ: {}, NUM: 42 }), 'utf8');
    expect(loadAppSecrets(configPath, 'app.example')).toEqual({ STR: 'ok' });
  });

  it('creates the secrets directory on save', () => {
    saveAppSecrets(configPath, 'app.example', { KEY: 'value' });
    expect(existsSync(appSecretsDir(configPath))).toBe(true);
  });

  it('lists apps that have stored secrets', () => {
    saveAppSecrets(configPath, 'app.one', { KEY: 'a' });
    saveAppSecrets(configPath, 'app.two', { KEY: 'b' });
    const apps = listAppsWithSecrets(configPath).sort();
    expect(apps).toEqual(['app.one', 'app.two']);
  });

  it('returns an empty list when no secrets directory exists', () => {
    expect(listAppsWithSecrets(configPath)).toEqual([]);
  });
});
