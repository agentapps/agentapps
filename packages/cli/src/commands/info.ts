/**
 * @agentapps/cli — info command.
 *
 * Two modes:
 *   info <app-id>     — inspect an uninstalled app from the workspace manifest
 *   <alias> info      — inspect an installed instance (includes auth + tool count)
 */

import { sourceMetadata } from '../config.js';
import { isResult, StationError, stationOf } from '../station-client.js';
import { findInstallation, withSession } from '../station-session.js';
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

  // The Manifest on disk once downloaded, otherwise the catalog entry
  // (DIST-REQ-2). The App's code is not loaded to describe it.
  const manifest = sourceMetadata(ctx.configPath, entry.source);

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

/** `<alias> info`: the App behind an Installation, as the Station has it. */
async function handleAliasInfo(alias: string, context: HandlerContext): Promise<HandlerResult> {
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    const instance = await findInstallation(station, alias);
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

    let manifest: Record<string, unknown> | undefined;
    try {
      manifest = await station.api('GET', `/apps/${encodeURIComponent(instance.appId)}/manifest`);
    } catch (err) {
      if (!(err instanceof StationError)) throw err;
      manifest = undefined;
    }
    if (!manifest) {
      return {
        success: false,
        exitCode: 1,
        error: { message: `Could not read manifest for ${instance.appId}` },
      };
    }

    // Tool count: what the Station lists for this Installation.
    let toolCount = 0;
    try {
      toolCount = (
        await withSession(station, instance, context.sessions, (session) => session.listTools())
      ).length;
    } catch {
      toolCount = 0;
    }

    const data = formatManifestData(manifest) as Record<string, ResultValue>;
    data.Instance = alias;
    data['Auth status'] = instance.auth?.authenticated ? 'authenticated' : 'not configured';
    data.Tools = toolCount;
    return { success: true, data: data as ResultValue, exitCode: 0 };
  } catch (err) {
    return station.failure(err);
  }
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
    // DIST-REQ-2: a catalog entry does not say these; they show once downloaded.
    ...(capabilities ? { Capabilities: enabledCaps.join(', ') || 'none' } : {}),
    Auth: authType,
    'System secrets': systemSecrets.length > 0 ? systemSecrets.join(', ') : 'none',
    ...(entrypoint ? { Entrypoint: entrypointStr } : {}),
  };

  return data;
}
