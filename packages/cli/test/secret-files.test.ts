/**
 * Files that hold secrets are readable by their owner only (CLI-REQ-13).
 */

import { chmodSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handleConfig } from '../src/commands/config.js';
import { addInstallation } from '../src/state.js';
import { options, startWorkspace, type TestWorkspace, writeApp } from './support/workspace.js';

let workspace: TestWorkspace | undefined;
afterEach(async () => {
  await workspace?.stop();
  workspace = undefined;
});

const mode = (path: string) => statSync(path).mode & 0o777;

describe.skipIf(process.platform === 'win32')('secret files', () => {
  it('[CLI-AC-13] system and Installation secrets end up with mode 0600, even over a wider file', async () => {
    const first = await startWorkspace();
    await first.stop();
    const dir = first.dir;
    const source = writeApp(join(dir, 'app.x'), {
      id: 'app.x',
      version: '1.0.0',
      auth: { type: 'api-key', systemSecrets: ['CLIENT_SECRET'], installationSecrets: ['API_KEY'] },
    });
    workspace = await startWorkspace({ dir, sources: [source] });
    const { installationId } = addInstallation(workspace.configPath, 'x', 'app.x');
    const config = (target: string, arg: string) =>
      handleConfig(
        { type: 'config', appId: target, args: [arg] },
        { ctx: (workspace as TestWorkspace).ctx(), options: options() },
      );

    // Files that already existed, readable by others.
    const system = join(dir, '.secrets', 'apps', 'app.x.json');
    mkdirSync(join(dir, '.secrets', 'apps'), { recursive: true });
    writeFileSync(system, '{}');
    chmodSync(system, 0o644);
    const installation = join(dir, '.agentapps', 'installation-secrets', `${installationId}.json`);
    mkdirSync(join(dir, '.agentapps', 'installation-secrets'), { recursive: true });
    writeFileSync(installation, '{}');
    chmodSync(installation, 0o644);

    expect((await config('app.x', 'CLIENT_SECRET:s')).error).toBeUndefined();
    expect(mode(system)).toBe(0o600);
    expect((await config('x', 'API_KEY:k')).error).toBeUndefined();
    expect(mode(installation)).toBe(0o600);
  });
});
