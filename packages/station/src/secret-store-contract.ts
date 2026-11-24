/**
 * The contract every Secret Store implementation passes.
 *
 * Framework-free: each case is a name and an async function that throws when
 * the store misbehaves, so any test runner can drive it:
 *
 *   for (const c of secretStoreContract) it(c.name, () => c.run(() => new MyStore()));
 *
 * @spec SECRETSTORE-NFR-2
 */

import assert from 'node:assert/strict';
import type { SecretStore } from './secret-store.js';

export interface SecretStoreContractCase {
  name: string;
  /** `create` answers a new, empty store each time it is called. */
  run(create: () => SecretStore | Promise<SecretStore>): Promise<void>;
}

const G = 'stn_g';
const R = 'stn_r';
const WS = 'ws_c';

export const secretStoreContract: SecretStoreContractCase[] = [
  {
    name: 'system secrets: set merges, get reads, remove deletes without a trace',
    async run(create) {
      const store = await create();
      const scope = { stationId: G, appId: 'app.google.gmail' };
      assert.deepEqual(await store.getSystemSecrets(scope), {});
      await store.setSystemSecrets(scope, { CLIENT_ID: 'id', CLIENT_SECRET: 'secret' });
      await store.setSystemSecrets(scope, { CLIENT_ID: 'id-2' });
      assert.deepEqual(await store.getSystemSecrets(scope), {
        CLIENT_ID: 'id-2',
        CLIENT_SECRET: 'secret',
      });
      assert.deepEqual(await store.removeSystemSecrets(scope, ['CLIENT_SECRET', 'ABSENT']), [
        'CLIENT_SECRET',
      ]);
      const left = await store.getSystemSecrets(scope);
      assert.deepEqual(left, { CLIENT_ID: 'id-2' });
      assert.equal(Object.hasOwn(left, 'CLIENT_SECRET'), false);
      assert.deepEqual(await store.removeSystemSecrets(scope, ['CLIENT_SECRET']), []);
    },
  },
  {
    name: 'installation secrets: set merges, get reads, remove deletes without a trace',
    async run(create) {
      const store = await create();
      const scope = { stationId: G, workspaceId: WS, installationId: 'ins_1' };
      assert.deepEqual(await store.getInstallationSecrets(scope), {});
      await store.setInstallationSecrets(scope, { ACCESS_TOKEN: 'at', REFRESH_TOKEN: 'rt' });
      await store.setInstallationSecrets(scope, { ACCESS_TOKEN: 'at-2' });
      assert.deepEqual(await store.getInstallationSecrets(scope), {
        ACCESS_TOKEN: 'at-2',
        REFRESH_TOKEN: 'rt',
      });
      assert.deepEqual(
        (await store.removeInstallationSecrets(scope, ['ACCESS_TOKEN', 'REFRESH_TOKEN'])).sort(),
        ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
      );
      assert.deepEqual(await store.getInstallationSecrets(scope), {});
    },
  },
  {
    name: 'the link-signing secret: set, get, remove',
    async run(create) {
      const store = await create();
      assert.equal(await store.getLinkSigningSecret({ stationId: G }), null);
      await store.setLinkSigningSecret({ stationId: G }, 'signing-secret');
      assert.equal(await store.getLinkSigningSecret({ stationId: G }), 'signing-secret');
      assert.equal(await store.removeLinkSigningSecret({ stationId: G }), true);
      assert.equal(await store.getLinkSigningSecret({ stationId: G }), null);
      assert.equal(await store.removeLinkSigningSecret({ stationId: G }), false);
    },
  },
  {
    name: 'an Installation does not see the secrets of another',
    async run(create) {
      const store = await create();
      const one = { stationId: G, workspaceId: WS, installationId: 'ins_1' };
      const two = { stationId: G, workspaceId: WS, installationId: 'ins_2' };
      await store.setInstallationSecrets(one, { ACCESS_TOKEN: 'one' });
      assert.deepEqual(await store.getInstallationSecrets(two), {});
      assert.deepEqual(await store.removeInstallationSecrets(two, ['ACCESS_TOKEN']), []);
      assert.deepEqual(await store.getInstallationSecrets(one), { ACCESS_TOKEN: 'one' });
    },
  },
  {
    // @spec SECRETSTORE-REQ-6
    name: 'two Stations on one store do not see each other’s secrets of any kind',
    async run(create) {
      const store = await create();
      const app = 'app.google.gmail';
      await store.setSystemSecrets({ stationId: G, appId: app }, { CLIENT_ID: 'of-g' });
      assert.deepEqual(await store.getSystemSecrets({ stationId: R, appId: app }), {});

      const onG = { stationId: G, workspaceId: WS, installationId: 'ins_1' };
      const onR = { stationId: R, workspaceId: WS, installationId: 'ins_1' };
      await store.setInstallationSecrets(onG, { ACCESS_TOKEN: 'of-g' });
      assert.deepEqual(await store.getInstallationSecrets(onR), {});

      await store.setLinkSigningSecret({ stationId: G }, 'of-g');
      assert.equal(await store.getLinkSigningSecret({ stationId: R }), null);

      // What R sets and removes leaves G's in place.
      await store.setSystemSecrets({ stationId: R, appId: app }, { CLIENT_ID: 'of-r' });
      await store.setInstallationSecrets(onR, { ACCESS_TOKEN: 'of-r' });
      await store.setLinkSigningSecret({ stationId: R }, 'of-r');
      assert.deepEqual(
        await store.removeSystemSecrets({ stationId: R, appId: app }, ['CLIENT_ID']),
        ['CLIENT_ID'],
      );
      assert.deepEqual(await store.removeInstallationSecrets(onR, ['ACCESS_TOKEN']), [
        'ACCESS_TOKEN',
      ]);
      assert.equal(await store.removeLinkSigningSecret({ stationId: R }), true);
      assert.deepEqual(await store.getSystemSecrets({ stationId: G, appId: app }), {
        CLIENT_ID: 'of-g',
      });
      assert.deepEqual(await store.getInstallationSecrets(onG), { ACCESS_TOKEN: 'of-g' });
      assert.equal(await store.getLinkSigningSecret({ stationId: G }), 'of-g');
    },
  },
  {
    name: 'what a read answers is a copy: changing it does not change the store',
    async run(create) {
      const store = await create();
      const scope = { stationId: G, appId: 'app.x' };
      await store.setSystemSecrets(scope, { KEY: 'value' });
      const read = await store.getSystemSecrets(scope);
      read.KEY = 'changed';
      assert.deepEqual(await store.getSystemSecrets(scope), { KEY: 'value' });
    },
  },
];
