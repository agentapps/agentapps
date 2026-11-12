/**
 * @agentapps/cli — semantic color theme.
 *
 * One color per entity kind, used everywhere an entity appears: completion
 * candidates, table columns, entries listings, key-value fields, and help.
 *
 *   indigo — system commands and subcommands
 *   orange — app ids (catalog entries like app.replicate)
 *   yellow — instances (installed aliases like replicate)
 *   green  — tool names
 *   gray   — tool parameters
 *
 * The REPL prompt itself is cyan, deliberately outside this map so it never
 * clashes with any entity color.
 */

import { type ColorOptions, color, GRAY, GREEN, INDIGO, ORANGE, YELLOW } from './colors.js';

export type EntityKind = 'command' | 'app' | 'instance' | 'tool' | 'param';

export const ENTITY_COLORS: Record<EntityKind, string> = {
  command: INDIGO,
  app: ORANGE,
  instance: YELLOW,
  tool: GREEN,
  param: GRAY,
};

/**
 * Column/field names that always render in their entity color, in tables,
 * entries listings, and key-value blocks.
 */
export const COLUMN_ENTITY: Record<string, EntityKind> = {
  Tool: 'tool',
  Alias: 'instance',
  Instance: 'instance',
  App: 'app',
  'App ID': 'app',
  Parameters: 'param',
};

/** Colorize a value by entity kind; returns it untouched when kind is unset. */
export function colorizeEntity(
  kind: EntityKind | undefined,
  text: string,
  options: ColorOptions,
): string {
  return kind ? color(ENTITY_COLORS[kind], text, options) : text;
}
