/**
 * Secrets on disk are readable by their owner only (CLI-REQ-13).
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InstallationSecretsStore } from '../src/host.js';
import { saveAppSecrets } from '../src/secrets-store.js';
import { addInstallation, writeInstallationSecrets } from '../src/state.js';

let dir: string;
let configPath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentapps-secret-files-'));
  configPath = join(dir, 'agentapps.json');
  writeFileSync(configPath, JSON.stringify({ apps: [] }));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const mode = (path: string) => statSync(path).mode & 0o777;

describe.skipIf(process.platform === 'win32')('secret files', () => {
  it('[CLI-AC-13] system and Installation secrets end up with mode 0600, even over a wider file', () => {
    const system = join(dir, '.secrets', 'apps', 'app.x.json');
    mkdirSync(join(dir, '.secrets', 'apps'), { recursive: true });
    writeFileSync(system, '{}');
    chmodSync(system, 0o644);
    saveAppSecrets(configPath, 'app.x', { CLIENT_SECRET: 's' });
    expect(mode(system)).toBe(0o600);

    const { installationId } = addInstallation(configPath, 'x', 'app.x');
    const installation = join(dir, '.agentapps', 'installation-secrets', `${installationId}.json`);
    mkdirSync(join(dir, '.agentapps', 'installation-secrets'), { recursive: true });
    writeFileSync(installation, '{}');
    chmodSync(installation, 0o644);
    writeInstallationSecrets(configPath, installationId, { API_KEY: 'k' });
    expect(mode(installation)).toBe(0o600);

    chmodSync(installation, 0o644);
    new InstallationSecretsStore(configPath, installationId).merge({ ACCESS_TOKEN: 't' });
    expect(mode(installation)).toBe(0o600);
  });
});
