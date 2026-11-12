/**
 * @agentapps/cli — tool definitions cache.
 *
 * Tool definitions live in app code, so listing them requires importing the
 * app module and opening a session — too slow for tab completion. Commands
 * that already have a live session (tools, tool) persist tool names and
 * parameter keys here so `getCompletions()` can suggest them from a
 * synchronous, static-file read.
 *
 * The cache is advisory: entries may be stale until the next refresh, and
 * every operation is best-effort (a broken cache must never break a command).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureStateDir, stateDir } from './state.js';

const TOOLS_CACHE_FILE = 'tools-cache.json';

export interface CachedToolParam {
  name: string;
  type?: string;
  required?: boolean;
}

export interface CachedTool {
  name: string;
  params: CachedToolParam[];
}

interface ToolsCacheEntry {
  tools: CachedTool[];
  cachedAt: string;
}

type ToolsCache = Record<string, ToolsCacheEntry>;

function cachePath(configPath: string): string {
  return resolve(stateDir(configPath), TOOLS_CACHE_FILE);
}

function normalizeTool(raw: unknown): CachedTool | undefined {
  // Legacy cache entries stored bare tool names.
  if (typeof raw === 'string') return { name: raw, params: [] };
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  if (typeof record.name !== 'string') return undefined;
  const params = Array.isArray(record.params)
    ? record.params.filter(
        (p): p is CachedToolParam =>
          typeof p === 'object' &&
          p !== null &&
          typeof (p as Record<string, unknown>).name === 'string',
      )
    : [];
  return { name: record.name, params };
}

function readCache(configPath: string): ToolsCache {
  const path = cachePath(configPath);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const cache: ToolsCache = {};
    for (const [appId, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        typeof entry === 'object' &&
        entry !== null &&
        Array.isArray((entry as Record<string, unknown>).tools)
      ) {
        cache[appId] = {
          tools: ((entry as Record<string, unknown>).tools as unknown[])
            .map(normalizeTool)
            .filter((t): t is CachedTool => t !== undefined),
          cachedAt: String((entry as Record<string, unknown>).cachedAt ?? ''),
        };
      }
    }
    return cache;
  } catch {
    return {};
  }
}

/** Cached tool definitions for an app, or [] when never cached. */
export function readCachedTools(configPath: string, appId: string): CachedTool[] {
  return readCache(configPath)[appId]?.tools ?? [];
}

/** Extract completion-relevant parameter info from a tool's JSON schema. */
function extractParams(parameters: unknown): CachedToolParam[] {
  if (typeof parameters !== 'object' || parameters === null) return [];
  const schema = parameters as Record<string, unknown>;
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return [];
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  return Object.entries(properties).map(([name, prop]) => ({
    name,
    type: typeof prop?.type === 'string' ? (prop.type as string) : undefined,
    required: required.has(name),
  }));
}

/** Persist the tool definitions for an app. Best-effort: never throws. */
export function writeCachedTools(
  configPath: string,
  appId: string,
  tools: Array<{ name: string; parameters?: unknown }>,
): void {
  try {
    ensureStateDir(configPath);
    const cache = readCache(configPath);
    cache[appId] = {
      tools: tools.map((t) => ({ name: t.name, params: extractParams(t.parameters) })),
      cachedAt: new Date().toISOString(),
    };
    writeFileSync(cachePath(configPath), `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  } catch {
    // Completion suggestions are a convenience — ignore cache write failures.
  }
}
