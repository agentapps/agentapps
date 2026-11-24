/**
 * Secret Store implementations: the shared contract, and what is particular
 * to the local one (SECRETSTORE).
 */

import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  InMemorySecretStore,
  LocalSecretStore,
  type SecretStore,
  secretStoreContract,
} from '../src/index.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentapps-secret-store-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A local store laid out like a workspace of the CLI. */
function local(root: string, stationId = 'stn_g'): LocalSecretStore {
  return new LocalSecretStore({
    stationId,
    systemSecretsDir: join(root, '.secrets', 'apps'),
    installationSecretsDir: join(root, '.agentapps', 'installation-secrets'),
    linkSigningSecretPath: join(root, '.agentapps', 'station-secret'),
    otherStationsDir: join(root, '.agentapps', 'stations'),
  });
}

function everyFile(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? everyFile(join(root, entry.name)) : [join(root, entry.name)],
  );
}

const implementations: Array<[string, () => SecretStore]> = [
  ['InMemorySecretStore', () => new InMemorySecretStore()],
  ['LocalSecretStore', () => local(mkdtempSync(join(dir, 'store-')))],
];

for (const [name, create] of implementations) {
  describe(`${name} passes the Secret Store contract`, () => {
    for (const contractCase of secretStoreContract) {
      it(`[SECRETSTORE-AC-9] ${contractCase.name}`, () => contractCase.run(create));
    }
    it('[SECRETSTORE-AC-5] two Stations on one store do not see each other', async () => {
      const isolation = secretStoreContract.find((c) => c.name.startsWith('two Stations'));
      expect(isolation).toBeDefined();
      await isolation?.run(create);
    });
  });
}

describe('the Secret Store contract', () => {
  it('[SECRETSTORE-AC-2] has operations for secrets only', () => {
    const operations = Object.getOwnPropertyNames(InMemorySecretStore.prototype)
      .filter((name) => name !== 'constructor')
      .filter((name) => /^(get|set|remove)/.test(name))
      .sort();
    expect(operations).toEqual([
      'getInstallationSecrets',
      'getLinkSigningSecret',
      'getSystemSecrets',
      'removeInstallationSecrets',
      'removeLinkSigningSecret',
      'removeSystemSecrets',
      'setInstallationSecrets',
      'setLinkSigningSecret',
      'setSystemSecrets',
    ]);
    for (const operation of operations) {
      expect(operation).not.toMatch(/Document|Object|Volume|Policy|ApiKey|Installation(?!Secrets)/);
    }
  });
});

describe('LocalSecretStore', () => {
  it('[SECRETSTORE-AC-7] finds what a workspace already keeps, where it keeps it', async () => {
    // What the CLI wrote before there was a Secret Store.
    mkdirSync(join(dir, '.secrets', 'apps'), { recursive: true });
    mkdirSync(join(dir, '.agentapps', 'installation-secrets'), { recursive: true });
    writeFileSync(
      join(dir, '.secrets', 'apps', 'app.google.gmail.json'),
      JSON.stringify({ CLIENT_ID: 'id', CLIENT_SECRET: 'secret' }),
    );
    writeFileSync(
      join(dir, '.agentapps', 'installation-secrets', 'ins_a8f1e394.json'),
      JSON.stringify({ ACCESS_TOKEN: 'at', REFRESH_TOKEN: 'rt' }),
    );
    writeFileSync(join(dir, '.agentapps', 'station-secret'), 'signing-secret\n');

    // Whatever id the Station is given, its directory is its own.
    const store = local(dir, 'stn_any_id');
    expect(
      await store.getSystemSecrets({ stationId: 'stn_any_id', appId: 'app.google.gmail' }),
    ).toEqual({ CLIENT_ID: 'id', CLIENT_SECRET: 'secret' });
    expect(
      await store.getInstallationSecrets({
        stationId: 'stn_any_id',
        workspaceId: 'ws_home',
        installationId: 'ins_a8f1e394',
      }),
    ).toEqual({ ACCESS_TOKEN: 'at', REFRESH_TOKEN: 'rt' });
    expect(await store.getLinkSigningSecret({ stationId: 'stn_any_id' })).toBe('signing-secret');
  });

  it('[SECRETSTORE-AC-7] every file it writes can be read by its owner only', async () => {
    const store = local(dir);
    await store.setSystemSecrets({ stationId: 'stn_g', appId: 'app.x' }, { KEY: 'v' });
    await store.setInstallationSecrets(
      { stationId: 'stn_g', workspaceId: 'ws', installationId: 'ins_1' },
      { TOKEN: 'v' },
    );
    await store.setLinkSigningSecret({ stationId: 'stn_g' }, 'secret');
    await store.setSystemSecrets({ stationId: 'stn_other', appId: 'app.x' }, { KEY: 'v' });
    await store.setLinkSigningSecret({ stationId: 'stn_other' }, 'secret');

    const files = everyFile(dir);
    expect(files.length).toBe(5);
    for (const file of files) expect(statSync(file).mode & 0o777, file).toBe(0o600);
  });

  it('a file that was readable by others is narrowed when it is written again', async () => {
    mkdirSync(join(dir, '.secrets', 'apps'), { recursive: true });
    const path = join(dir, '.secrets', 'apps', 'app.x.json');
    writeFileSync(path, JSON.stringify({ OLD: 'v' }), { mode: 0o644 });
    await local(dir).setSystemSecrets({ stationId: 'stn_g', appId: 'app.x' }, { NEW: 'v' });
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('removing the last secret leaves no file behind', async () => {
    const store = local(dir);
    const scope = { stationId: 'stn_g', appId: 'app.x' };
    await store.setSystemSecrets(scope, { KEY: 'v' });
    await store.removeSystemSecrets(scope, ['KEY']);
    expect(everyFile(dir)).toEqual([]);
  });

  it('refuses an id that would leave its directory', async () => {
    const store = local(dir);
    await expect(
      store.getSystemSecrets({ stationId: 'stn_g', appId: '../escape' }),
    ).rejects.toThrow(/Not usable as a name/);
    await expect(store.setLinkSigningSecret({ stationId: '../../escape' }, 'x')).rejects.toThrow(
      /Not usable as a name/,
    );
  });
});
