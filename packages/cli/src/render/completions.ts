/**
 * @agentapps/cli — colored completion list rendering.
 *
 * readline uses the completer's strings both for display AND for inserting
 * text into the line, so ANSI codes cannot travel through it. The REPL
 * bypasses readline's display: when the only thing left to do is list the
 * candidates, it prints them with this formatter and redraws the prompt.
 */

import type { CompletionCandidate, CompletionKind } from '../repl-parser.js';
import { type ColorOptions, color } from './colors.js';
import { ENTITY_COLORS, type EntityKind } from './theme.js';

/**
 * Completion kinds map onto the shared entity theme; 'value' candidates
 * (bash/zsh, set/remove, allow/deny) stay plain.
 */
const KIND_ENTITY: Partial<Record<CompletionKind, EntityKind>> = {
  command: 'command',
  alias: 'instance',
  app: 'app',
  tool: 'tool',
  param: 'param',
};

/** Format candidates into terminal columns, colorized by kind. */
export function formatCompletionColumns(
  candidates: CompletionCandidate[],
  options: { width?: number; colors: ColorOptions },
): string {
  if (candidates.length === 0) return '';

  const width = options.width ?? 80;
  const colWidth = Math.max(...candidates.map((c) => c.value.length)) + 2;
  const columns = Math.max(1, Math.floor(width / colWidth));

  const lines: string[] = [];
  for (let i = 0; i < candidates.length; i += columns) {
    const row = candidates.slice(i, i + columns).map((c, j, cells) => {
      // Pad before colorizing — ANSI codes have zero display width.
      const padded = j === cells.length - 1 ? c.value : c.value.padEnd(colWidth);
      const entity = KIND_ENTITY[c.kind];
      return entity ? color(ENTITY_COLORS[entity], padded, options.colors) : padded;
    });
    lines.push(row.join(''));
  }
  return lines.join('\n');
}
