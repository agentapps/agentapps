/**
 * Acceptance tests for the Workspace Volume spec (docs/specs/volume.md).
 *
 * VOL-AC-1, VOL-AC-2 and VOL-AC-3 run against the Station's volume handlers,
 * the AppStation spawn path and both runtimes.
 */

import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
} from '@agentapps/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AppStation,
  handleVolumeRequest,
  InProcessRuntime,
  type InstanceEnvironment,
  LocalProcessRuntime,
  resolveMountPath,
  type VolumeHandlerContext,
} from '../src/index.js';

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'vol-spec-'));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

function ctx(
  workspaceId: string,
  sessionId: string,
  permissions: { volume?: boolean } | undefined = { volume: true },
): VolumeHandlerContext {
  return { volumesBasePath: base, workspaceId, sessionId, permissions };
}

function req(type: string, path: string, extra: Record<string, unknown> = {}) {
  return {
    id: `m_${type}`,
    type,
    timestamp: new Date().toISOString(),
    version: '2.0',
    sessionId: 's',
    requestId: `r_${type}`,
    path,
    ...extra,
  };
}

const b64 = (text: string) => Buffer.from(text).toString('base64');

describe('Workspace Volume', () => {
  it('[VOL-AC-1] Installations of one Workspace share the Volume; another Workspace does not see it', async () => {
    // Two Installations of the same Workspace: the handler context is per
    // session, and the Volume is chosen by Workspace only.
    await handleVolumeRequest(
      ctx('hexagon', 'sess_installation_a'),
      req('file_volume_write_file', 'report.md', { data: b64('q3') }),
    );

    const seenByB = await handleVolumeRequest(
      ctx('hexagon', 'sess_installation_b'),
      req('file_volume_read_dir', ''),
    );
    expect(seenByB?.success).toBe(true);
    expect((seenByB?.entries as Array<{ name: string }>).map((e) => e.name)).toEqual(['report.md']);

    const seenByOther = await handleVolumeRequest(
      ctx('other-workspace', 'sess_other'),
      req('file_volume_read_file', 'report.md'),
    );
    expect(seenByOther?.success).toBe(false);
  });

  it('[VOL-AC-2] without the volume Permission requests are denied and no mount reaches the Instance', async () => {
    const denied = await handleVolumeRequest(
      ctx('hexagon', 's', {}),
      req('file_volume_write_file', 'x.txt', { data: b64('x') }),
    );
    expect(denied?.success).toBe(false);
    expect(denied?.code).toBe('PERMISSION_DENIED');
    expect(denied?.details).toMatchObject({ layer: 'permission', permission: 'volume' });

    // Mount decision: never without the Permission, even when declared.
    expect(
      resolveMountPath({
        mountVolume: true,
        permissions: {},
        volumesBasePath: base,
        workspaceId: 'hexagon',
      }),
    ).toBeUndefined();

    // In-process Instance: the environment handed to the factory has no mount.
    const seen: Array<InstanceEnvironment | undefined> = [];
    const station = new AppStation({
      appId: 'app.mount-probe',
      appVersion: '1.0.0',
      runtime: new InProcessRuntime((_transport, environment) => {
        seen.push(environment);
      }),
      resolveMountPath: (open) =>
        resolveMountPath({
          mountVolume: true,
          permissions: open.effectivePermissions?.permissions,
          volumesBasePath: base,
          workspaceId: 'hexagon',
        }),
    });
    const [hostSide, stationSide] = createInProcessTransportPair();
    station.accept(stationSide);
    const opened = new Promise<void>((resolve) => {
      hostSide.onMessage((m) => {
        if ((m as { type: string }).type === 'session_opened') resolve();
      });
    });
    hostSide.send({
      ...createEnvelope('initialize'),
      supportedVersions: [PROTOCOL_VERSION],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    hostSide.send({
      ...createEnvelope('session_open'),
      installationId: 'ins_no_volume',
      tenant: { userId: 'u' },
      effectivePermissions: { permissions: {} },
    } as MessageBase);
    await opened;
    expect(seen).toHaveLength(1);
    expect(seen[0]?.volumePath).toBeUndefined();
    await station.shutdown();

    // Child process: AGENTAPPS_VOLUME_PATH is set only when a mount is decided.
    const probe = join(base, 'env-probe.mjs');
    await writeFile(
      probe,
      `process.stdout.write(JSON.stringify({ id: 'probe', type: 'env', timestamp: new Date().toISOString(), version: '2.0', value: process.env.AGENTAPPS_VOLUME_PATH ?? null }) + '\\n');\nsetInterval(() => {}, 1000);\n`,
    );
    await chmod(probe, 0o755);
    const childEnv = async (volumePath: string | undefined) => {
      const runtime = new LocalProcessRuntime({ entryPoint: probe });
      const handle = await runtime.spawn({
        installationId: 'ins_child',
        tenant: { userId: 'u' },
        volumePath,
      });
      const value = await new Promise<unknown>((resolve) => {
        handle.onMessage((m) => resolve((m as { value: unknown }).value));
      });
      await handle.stop(100);
      return value;
    };
    expect(await childEnv(undefined)).toBeNull();
    expect(await childEnv('/mnt/volume')).toBe('/mnt/volume');
  });

  it('[VOL-AC-3] mkdir creates nested directories; .. and absolute paths are INVALID_ARGUMENTS', async () => {
    const made = await handleVolumeRequest(ctx('hexagon', 's'), req('file_volume_mkdir', 'a/b/c'));
    expect(made?.type).toBe('file_volume_mkdir_result');
    expect(made?.success).toBe(true);
    const stat = await handleVolumeRequest(ctx('hexagon', 's'), req('file_volume_stat', 'a/b/c'));
    expect((stat?.stat as { type: string }).type).toBe('directory');

    for (const bad of ['../outside', 'a/../../outside', '/etc/passwd']) {
      const result = await handleVolumeRequest(
        ctx('hexagon', 's'),
        req('file_volume_read_file', bad),
      );
      expect(result?.success, bad).toBe(false);
      expect(result?.code, bad).toBe('INVALID_ARGUMENTS');
    }
  });
});
