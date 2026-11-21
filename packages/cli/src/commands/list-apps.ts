/**
 * @agentapps/cli — list-apps command.
 */

import { sourceMetadata } from '../config.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

/**
 * `apps [query]`: list the workspace's apps, keeping only those whose name,
 * tagline, description or keywords contain the query, ignoring case.
 *
 * @spec CLI-REQ-1
 * @spec DIST-REQ-2
 */
export async function handleListApps(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  const { config, configPath } = context.ctx;
  const query = command.type === 'apps' ? command.query?.toLowerCase() : undefined;
  const appIds = Object.keys(config.apps).filter(
    (id) => !query || searchText(configPath, config.apps[id]!.source).includes(query),
  );

  if (appIds.length === 0 && query) {
    return {
      success: true,
      data: [],
      message: `No apps match "${command.type === 'apps' ? command.query : ''}"`,
      exitCode: 0,
    };
  }

  if (appIds.length === 0) {
    return {
      success: true,
      message: 'No apps configured in agentapps.json.',
      data: { hint: 'Add an app with: install <app-id> <alias>' },
      exitCode: 0,
    };
  }

  const rows = appIds.map((id) => ({
    'App ID': id,
    Name: config.apps[id]?.name ?? appDisplayName(id),
  }));

  return {
    success: true,
    data: rows,
    message: `${appIds.length} app${appIds.length === 1 ? '' : 's'} available`,
    exitCode: 0,
  };
}

function appDisplayName(id: string): string {
  // Use the last segment of the id as a fallback name.
  const parts = id.split('.');
  const fallback = parts[parts.length - 1] ?? id;
  return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}

/**
 * The lowercased text `apps <query>` searches: name, tagline, description and
 * keywords, from the catalog when the app is not downloaded yet (DIST-REQ-2).
 */
function searchText(configPath: string, source: string): string {
  const manifest = sourceMetadata(configPath, source) ?? {};
  const keywords = Array.isArray(manifest.keywords) ? manifest.keywords : [];
  return [manifest.name, manifest.tagline, manifest.description, ...keywords]
    .filter((v): v is string => typeof v === 'string')
    .join('\n')
    .toLowerCase();
}
