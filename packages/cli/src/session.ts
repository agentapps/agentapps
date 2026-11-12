/**
 * @agentapps/cli — shared app session helper.
 *
 * Opens an app session with per-installation secrets. Used by command handlers
 * and the REPL.
 */

import { dirname, resolve } from 'node:path';
import { AgentAppHost } from '@agentapps/host';
import { createInProcessTransportPair } from '@agentapps/protocol';
import { AppStation, InProcessRuntime, resolveMountPath } from '@agentapps/station';
import { createCliHostRequestHandlers } from './host.js';
import { getInstallationById, unapprovedPermissions } from './state.js';
import type { CliContext, ResolvedApp } from './types.js';

export interface AppSession {
  session: Awaited<ReturnType<AgentAppHost['openSession']>>;
  shutdown: () => Promise<void>;
}

export interface AppSessionOptions {
  /** AppStation idle timeout; raise it for long-lived (pooled) sessions. */
  idleTimeoutMs?: number;
}

/** Open a session with the app and return a cleanup function. */
export async function openAppSession(
  app: ResolvedApp,
  ctx: CliContext,
  installationId?: string,
  options?: AppSessionOptions,
): Promise<AppSession> {
  const appId = (app.manifest?.id as string) ?? `app.${app.name}`;
  const appVersion = (app.manifest?.version as string) ?? '1.0.0';

  const installation = installationId
    ? getInstallationById(ctx.configPath, installationId)
    : undefined;
  const permissions = installation?.permissions as { volume?: boolean } | undefined;
  // POLICY-REQ-9: an App version that requests more must be re-approved first.
  const pending = installation
    ? unapprovedPermissions(
        app.manifest?.permissions as Record<string, unknown> | undefined,
        installation.permissions,
      )
    : [];
  if (installation && pending.length > 0) {
    throw new Error(
      `${appId} requests permissions not yet approved for ${installation.alias} (${pending.join(', ')}). Approve them with: install ${appId} ${installation.alias}`,
    );
  }
  const mountVolume = (app.manifest?.runtime as { mountVolume?: boolean } | undefined)?.mountVolume;

  const runtime = new InProcessRuntime(app.factory);
  const appStation = new AppStation({
    appId,
    appVersion,
    runtime,
    idleTimeoutMs: options?.idleTimeoutMs ?? 60_000,
    // VOL-REQ-5: same Volume directory the CLI Host serves in API mode.
    resolveMountPath: () =>
      resolveMountPath({
        mountVolume,
        permissions,
        volumesBasePath: resolve(dirname(resolve(ctx.configPath)), '.agentapps/data'),
        workspaceId: 'default',
      }),
  });

  const [hostSide, ctrlSide] = createInProcessTransportPair();
  appStation.accept(ctrlSide);

  const appEntry = ctx.config.apps[app.name] ?? { source: app.sourcePath };
  const host = new AgentAppHost(hostSide, {
    host: { name: 'agentapps-cli', version: '0.0.0' },
    // HOSTCAP-REQ-5: a single-user terminal Host that draws no UI.
    capabilities: {
      multiUser: false,
      push: true,
      prompts: ['auth', 'secret', 'url'],
      storage: true,
      objects: true,
      volume: true,
      profile: true,
      intents: false,
    },
    requests: createCliHostRequestHandlers({
      app,
      appEntry,
      configPath: ctx.configPath,
      installationId,
      permissions,
    }),
  });

  await host.initialize();

  const session = await host.openSession({
    installationId: installationId ?? ctx.configPath,
    tenant: { userId: 'developer' },
    ...(permissions ? { effectivePermissions: { permissions } } : {}),
  });

  return {
    session,
    async shutdown() {
      await host.shutdown();
      await appStation.shutdown();
    },
  };
}
