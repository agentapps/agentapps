/**
 * @agentapps/cli — info command.
 *
 * Two modes:
 *   info <app-id>     — inspect an uninstalled app from the workspace manifest
 *   <alias> info      — inspect an installed instance (includes auth + tool count)
 */

import { getAuthInfo } from '../auth-helper.js';
import { resolveSourcePath, sourceMetadata } from '../config.js';
import { resolveApp } from '../resolve.js';
import { openAppSession } from '../session.js';
import { getInstallation } from '../state.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

/** @spec DIST-REQ-2 */
export async function handleInfo(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'info') return { success: true, exitCode: 0 };

  const { ctx } = context;

  // Alias-scoped: <alias> info
  if (command.alias) {
    return handleAliasInfo(command.alias, context);
  }

  // Top-level: info <app-id>
  if (!command.appId) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: 'Missing app id',
        suggestion: 'Usage: info <app-id>',
      },
    };
  }

  const appId = command.appId;
  const entry = ctx.config.apps[appId];

  if (!entry) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `App not found: ${appId}`,
        suggestion: 'Run "apps" to see available apps.',
      },
    };
  }

  let manifest: Record<string, unknown> | undefined;
  try {
    const app = await resolveApp(appId, resolveSourcePath(ctx.configPath, entry.source));
    manifest = app.manifest;
  } catch {
    // DIST-REQ-2: not downloaded yet, so describe it from the catalog.
    manifest = sourceMetadata(ctx.configPath, entry.source);
  }

  if (!manifest) {
    return {
      success: false,
      exitCode: 1,
      error: { message: `Could not read manifest for ${appId}` },
    };
  }

  return {
    success: true,
    data: formatManifestData(manifest),
    exitCode: 0,
  };
}

async function handleAliasInfo(alias: string, context: HandlerContext): Promise<HandlerResult> {
  const { ctx } = context;
  const instance = getInstallation(ctx.configPath, alias);

  if (!instance) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Unknown alias: ${alias}`,
        suggestion: 'Run "installations" to see installed apps.',
      },
    };
  }

  const entry = ctx.config.apps[instance.appId];
  if (!entry) {
    return {
      success: false,
      exitCode: 2,
      error: { message: `App configuration missing for ${instance.appId}` },
    };
  }

  const source = resolveSourcePath(ctx.configPath, entry.source);
  let manifest: Record<string, unknown> | undefined;
  try {
    const app = await resolveApp(instance.appId, source);
    manifest = app.manifest;
  } catch {
    manifest = undefined;
  }

  if (!manifest) {
    return {
      success: false,
      exitCode: 1,
      error: { message: `Could not read manifest for ${instance.appId}` },
    };
  }

  // Auth status
  const auth = await getAuthInfo(instance.installationId, instance.appId, ctx);
  const authStatus = auth.authenticated ? 'authenticated' : 'not configured';

  // Tool count — boot a session and list tools
  let toolCount = 0;
  try {
    const app = await resolveApp(instance.appId, source);
    const { session, shutdown } = await openAppSession(app, ctx, instance.installationId);
    try {
      const tools = await session.listTools();
      toolCount = tools.length;
    } finally {
      await session.close();
      await shutdown();
    }
  } catch {
    // If we can't boot the session, report 0 tools
    toolCount = 0;
  }

  const data = formatManifestData(manifest);
  const instanceData = data as Record<string, ResultValue>;
  instanceData.Instance = alias;
  instanceData['Auth status'] = authStatus;
  instanceData.Tools = toolCount;

  return {
    success: true,
    data: instanceData as ResultValue,
    exitCode: 0,
  };
}

function formatManifestData(manifest: Record<string, unknown>): ResultValue {
  const author = manifest.author as { name?: string; email?: string } | string | undefined;
  let authorStr: string;
  if (typeof author === 'string') {
    authorStr = author;
  } else if (author && typeof author === 'object') {
    authorStr = author.email ? `${author.name} <${author.email}>` : (author.name ?? 'unknown');
  } else {
    authorStr = 'unknown';
  }

  const capabilities = manifest.capabilities as Record<string, boolean> | undefined;
  const enabledCaps = capabilities
    ? Object.entries(capabilities)
        .filter(([, v]) => v === true)
        .map(([k]) => k)
    : [];

  const authSection = manifest.auth as Record<string, unknown> | undefined;
  const authType = (authSection?.type as string) ?? 'none';
  const systemSecrets = (authSection?.systemSecrets as string[]) ?? [];

  const entrypoint = manifest.entrypoint as Record<string, unknown> | undefined;
  const entrypointStr = entrypoint
    ? `${entrypoint.path ?? '?'} (${entrypoint.type ?? '?'}, export: ${entrypoint.export ?? 'default'})`
    : 'unknown';

  const keywords = manifest.keywords as string[] | undefined;

  const data: Record<string, ResultValue> = {
    Name: (manifest.name as string) ?? 'unknown',
    'App ID': (manifest.id as string) ?? 'unknown',
    Version: (manifest.version as string) ?? 'unknown',
    Description: (manifest.description as string) ?? '',
    Author: authorStr,
    License: (manifest.license as string) ?? 'unknown',
    Category: (manifest.category as string) ?? 'unknown',
    Keywords: keywords?.join(', ') ?? '',
    Capabilities: enabledCaps.join(', ') || 'none',
    Auth: authType,
    'System secrets': systemSecrets.length > 0 ? systemSecrets.join(', ') : 'none',
    Entrypoint: entrypointStr,
  };

  return data;
}
