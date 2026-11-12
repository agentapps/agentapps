/**
 * @agentapps/cli — human renderer.
 *
 * Structured terminal output: tables, key-value blocks, and labeled sections.
 */

import {
  BOLD,
  type ColorOptions,
  color,
  GRAY,
  GREEN,
  INDIGO,
  ORANGE,
  RED,
  RESET,
  stripAnsi,
  YELLOW,
} from './colors.js';
import { COLUMN_ENTITY, colorizeEntity } from './theme.js';
import type { CommandResult, Renderer } from './types.js';

export interface HumanRendererOptions {
  colors: ColorOptions;
  /**
   * Terminal width (columns) used to wrap long values. When omitted or 0
   * (e.g. output is piped, not a TTY), values are not wrapped.
   */
  width?: number;
}

/** Minimum number of columns reserved for a value before wrapping kicks in. */
const MIN_VALUE_WIDTH = 20;

const STATUS_GLYPH_COLORS: Record<string, string> = {
  '✓': GREEN,
  '●': YELLOW,
  '✗': RED,
};

const STATUS_GLYPH_PATTERN = /^(\s*)([✓●✗])(?=\s|$)/u;

export class HumanRenderer implements Renderer {
  private readonly colors: ColorOptions;
  private readonly width?: number;

  constructor(options: HumanRendererOptions) {
    this.colors = options.colors;
    this.width = options.width;
  }

  render(result: CommandResult): string {
    if (result.error) {
      return this.renderError(result.error.message, result.error.suggestion);
    }
    if (result.message && result.variant !== undefined) {
      const glyph = color(GREEN, '✓', this.colors);
      return `${result.variant}\n\n  ${glyph} ${result.message}`;
    }
    if (result.variant !== undefined) {
      return result.variant;
    }
    if (result.message) {
      return this.renderSuccess(result.message, result.data, result.layout);
    }
    if (result.data !== undefined) {
      return this.renderBody(result.data, 2, result.layout);
    }
    return '';
  }

  renderSuccess(
    message: string,
    data?: CommandResult['data'],
    layout?: CommandResult['layout'],
  ): string {
    const glyph = color(GREEN, '✓', this.colors);
    const prefix = '  ';
    const summary = `${prefix}${glyph} ${message}`;

    if (data !== undefined) {
      const rendered = this.renderBody(data, prefix.length, layout);
      if (rendered) {
        return `${rendered}\n\n${summary}`;
      }
    }

    return summary;
  }

  /** Dispatch to the entries layout when requested, else the generic path. */
  private renderBody(
    data: CommandResult['data'],
    indent: number,
    layout?: CommandResult['layout'],
  ): string {
    if (layout === 'entries' && Array.isArray(data) && data.length > 0 && isTableRow(data[0])) {
      return this.renderEntries(data as Record<string, string>[], indent);
    }
    return this.renderData(data, indent);
  }

  renderError(message: string, suggestion?: string): string {
    const glyph = color(RED, '✗', this.colors);
    let out = `  ${glyph} ${color(RED, message, this.colors)}`;
    if (suggestion) {
      out += `\n\n  ${this.infoGlyph()} ${suggestion}`;
    }
    return out;
  }

  renderData(data: CommandResult['data'], indent = 2): string {
    if (data === null || data === undefined) return '';

    if (Array.isArray(data)) {
      if (data.length === 0) return '';
      if (isTableRow(data[0])) {
        return this.renderTable(data as Record<string, string>[], indent);
      }
      return data.map((item) => this.renderData(item, indent)).join('\n');
    }

    if (typeof data === 'object') {
      return this.renderKeyValue(data as Record<string, CommandResult['data']>, indent);
    }

    return ' '.repeat(indent) + String(data);
  }

  /**
   * Multiline blocks for array-of-records data (`layout: 'entries'`):
   *
   *   <title>  <middle fields, gray, wrapped and aligned>
   *       <last field as body, wrapped to the full terminal width>
   *
   * Designed for listings like tools, where a table would squeeze the
   * description into a narrow column.
   */
  renderEntries(rows: Record<string, string>[], indent = 2): string {
    const prefix = ' '.repeat(indent);
    const bodyIndent = indent + 4;

    const blocks = rows.map((row) => {
      const keys = Object.keys(row);
      const [titleKey, ...restKeys] = keys;
      const bodyKey = restKeys.pop();
      const title = String(row[titleKey] ?? '');
      const annotation = restKeys
        .map((k) => String(row[k] ?? ''))
        .filter(Boolean)
        .join('  ');
      const annotationKind = COLUMN_ENTITY[restKeys[0]] ?? 'param';
      const body = bodyKey ? String(row[bodyKey] ?? '') : '';

      const lines: string[] = [];
      const titleText = colorizeEntity(
        COLUMN_ENTITY[titleKey] ?? 'tool',
        color(BOLD, title, this.colors),
        this.colors,
      );
      if (annotation) {
        const annColumn = indent + title.length + 2;
        const budget =
          this.width && this.width > 0
            ? Math.max(this.width - annColumn, MIN_VALUE_WIDTH)
            : Number.POSITIVE_INFINITY;
        const [firstAnn, ...moreAnn] =
          budget === Number.POSITIVE_INFINITY ? [annotation] : wrapWords(annotation, budget);
        lines.push(
          `${prefix}${titleText}  ${colorizeEntity(annotationKind, firstAnn, this.colors)}`,
        );
        for (const ann of moreAnn) {
          lines.push(`${' '.repeat(annColumn)}${colorizeEntity(annotationKind, ann, this.colors)}`);
        }
      } else {
        lines.push(`${prefix}${titleText}`);
      }

      if (body) {
        const budget =
          this.width && this.width > 0
            ? Math.max(this.width - bodyIndent, MIN_VALUE_WIDTH)
            : Number.POSITIVE_INFINITY;
        const bodyLines = budget === Number.POSITIVE_INFINITY ? [body] : wrapWords(body, budget);
        for (const line of bodyLines) {
          lines.push(`${' '.repeat(bodyIndent)}${line}`);
        }
      }

      return lines.join('\n');
    });

    return blocks.join('\n\n');
  }

  renderTable(rows: Record<string, string>[], indent = 2): string {
    if (rows.length === 0) return '';
    const keys = Object.keys(rows[0]);
    const padding = 1;
    const widths: Record<string, number> = {};
    for (const key of keys) {
      // Use stripAnsi so embedded color codes don't inflate column widths.
      widths[key] =
        Math.max(key.length, ...rows.map((r) => stripAnsi(String(r[key] ?? '')).length)) +
        padding * 2;
    }
    this.fitTableWidths(widths, keys, indent);

    // Pad using the visible (stripped) length so ANSI-colored values align.
    const cell = (text: string, width: number): string => {
      const visible = stripAnsi(text).length;
      const pad = Math.max(0, width - padding * 2 - visible);
      return ` ${text}${' '.repeat(pad)} `.padEnd(width + (text.length - visible));
    };
    const sep = (width: number): string => '─'.repeat(width);

    // Wrap cell text that exceeds its (possibly shrunken) column. Cells with
    // ANSI codes are left unwrapped — splitting escape sequences breaks them.
    const cellLines = (text: string, width: number): string[] => {
      const budget = width - padding * 2;
      if (stripAnsi(text).length <= budget || text !== stripAnsi(text)) return [text];
      return wrapWords(text, budget);
    };

    const prefix = ' '.repeat(indent);
    const header = keys.map((k) => color(BOLD, cell(k, widths[k]), this.colors)).join(' ');
    const divider = keys.map((k) => sep(widths[k])).join(' ');
    const lines = rows.flatMap((row) => {
      const columns = keys.map((k) =>
        cellLines(String(row[k] ?? ''), widths[k]).map((line) =>
          colorizeEntity(COLUMN_ENTITY[k], line, this.colors),
        ),
      );
      const height = Math.max(...columns.map((c) => c.length));
      return Array.from({ length: height }, (_, i) =>
        keys
          .map((k, j) => this.colorizeStatusGlyph(cell(columns[j][i] ?? '', widths[k])))
          .join(' '),
      );
    });

    return [header, divider, ...lines].map((line) => `${prefix}${line}`).join('\n');
  }

  /**
   * Shrink columns so the table fits the terminal width. Each step levels the
   * widest column down to the second widest, so the squeeze is shared instead
   * of flattening one column to its minimum. Columns never go below their
   * header width or MIN_VALUE_WIDTH — content is wrapped instead. No-op when
   * no width is configured (piped output).
   */
  private fitTableWidths(widths: Record<string, number>, keys: string[], indent: number): void {
    if (!this.width || this.width <= 0) return;
    const padding = 1;
    const overhead = indent + (keys.length - 1); // column separator spaces
    const minWidth = (key: string): number => Math.max(MIN_VALUE_WIDTH, key.length) + padding * 2;

    let total = keys.reduce((sum, k) => sum + widths[k], 0);
    while (total + overhead > this.width) {
      const shrinkable = keys
        .filter((k) => widths[k] > minWidth(k))
        .sort((a, b) => widths[b] - widths[a]);
      if (shrinkable.length === 0) break;
      const widest = shrinkable[0];
      const secondWidth = shrinkable[1] ? widths[shrinkable[1]] : minWidth(widest);
      const step = Math.max(1, widths[widest] - Math.max(minWidth(widest), secondWidth));
      const cut = Math.min(total + overhead - this.width, step, widths[widest] - minWidth(widest));
      widths[widest] -= cut;
      total -= cut;
    }
  }

  renderKeyValue(data: Record<string, CommandResult['data']>, indent = 2): string {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) return '';
    const maxKey = Math.max(...entries.map(([k]) => k.length));
    const prefix = ' '.repeat(indent);
    return entries
      .map(([key, value]) => {
        // Array of objects → a labeled list of readable blocks (one per item),
        // rather than a single JSON-stringified line.
        if (Array.isArray(value) && value.some(isPlainObject)) {
          const header = `${prefix}${color(BOLD, key, this.colors)}`;
          // Number each entity ([1], [2], …) padded to the widest index so the
          // markers align, and separate entities with a blank line.
          const idxWidth = String(value.length).length;
          const items = value.map((item, i) => {
            const bullet = `[${String(i + 1).padStart(idxWidth)}] `;
            return isPlainObject(item)
              ? this.renderListItem(
                  item as Record<string, CommandResult['data']>,
                  indent + 2,
                  bullet,
                )
              : `${' '.repeat(indent + 2)}${color(INDIGO, bullet, this.colors)}${this.formatValue(
                  item as CommandResult['data'],
                )}`;
          });
          return `${header}\n${items.join('\n\n')}`;
        }
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const section = `${prefix}${color(BOLD, key, this.colors)}\n${this.renderKeyValue(
            value as Record<string, CommandResult['data']>,
            indent + 2,
          )}`;
          return section;
        }
        return this.renderField(key, value, indent, maxKey);
      })
      .join('\n');
  }

  /**
   * Render one object of an array as a block: the first field is bulleted with
   * `-`, the rest align underneath. Keys are padded so values line up.
   */
  renderListItem(item: Record<string, CommandResult['data']>, indent = 2, bullet = '- '): string {
    const entries = Object.entries(item).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) return '';
    const maxKey = Math.max(...entries.map(([k]) => k.length));
    // The first field carries the (colored) bullet; later fields align under it.
    const coloredBullet = color(INDIGO, bullet, this.colors);
    const cont = ' '.repeat(bullet.length);
    return entries
      .map(([key, value], i) =>
        i === 0
          ? this.renderField(key, value, indent, maxKey, coloredBullet, bullet.length)
          : this.renderField(key, value, indent, maxKey, cont),
      )
      .join('\n');
  }

  /**
   * Render a single `key: value` line, wrapping a long value to the terminal
   * width with continuation lines aligned under the value column.
   *
   * `markerWidth` is the marker's visible width — passed separately because a
   * colored marker contains ANSI codes wider than the glyphs it prints.
   */
  renderField(
    key: string,
    value: CommandResult['data'],
    indent: number,
    maxKey: number,
    marker = '',
    markerWidth = marker.length,
  ): string {
    const prefix = ' '.repeat(indent);
    const paddedKey = `${key}:`.padEnd(maxKey + 1);
    const valueColumn = indent + markerWidth + maxKey + 1 + 1;
    const wrapped = this.wrapValue(this.formatValue(value), valueColumn);
    const entity = COLUMN_ENTITY[key];
    const rendered = entity
      ? colorizeEntity(entity, wrapped, this.colors)
      : this.colorizeStatusGlyph(wrapped);
    return `${prefix}${marker}${color(BOLD, paddedKey, this.colors)} ${rendered}`;
  }

  /**
   * Color a leading ✓/●/✗ status glyph (green/yellow/red). Padding must be
   * applied before this — the ANSI codes make the string wider than it prints.
   */
  colorizeStatusGlyph(text: string): string {
    if (!this.colors.enabled) return text;
    return text.replace(
      STATUS_GLYPH_PATTERN,
      (_match, ws: string, glyph: string) => `${ws}${STATUS_GLYPH_COLORS[glyph]}${glyph}${RESET}`,
    );
  }

  /**
   * Wrap a value to fit the terminal width. Continuation lines are indented to
   * `valueColumn` so they line up under the first line's value. No-op when no
   * width is configured (piped output) or the value already fits.
   */
  wrapValue(text: string, valueColumn: number): string {
    if (!this.width || this.width <= 0) return text;
    const budget = Math.max(this.width - valueColumn, MIN_VALUE_WIDTH);
    if (text.length <= budget && !text.includes('\n')) return text;
    return wrapWords(text, budget).join(`\n${' '.repeat(valueColumn)}`);
  }

  formatValue(value: CommandResult['data']): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map((v) => this.formatValue(v)).join(', ');
    return JSON.stringify(value);
  }

  infoGlyph(): string {
    return color(GRAY, 'ℹ', this.colors);
  }
}

function isTableRow(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Greedily wrap text to `width` columns at whitespace boundaries. A single word
 * longer than `width` (e.g. a URL) is kept intact on its own line.
 */
function wrapWords(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current === '') {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function statusGlyph(
  status: 'authenticated' | 'missing_auth' | 'error',
  colors: ColorOptions,
): string {
  if (status === 'authenticated') return color(GREEN, '✓', colors);
  if (status === 'missing_auth') return color(YELLOW, '●', colors);
  return color(RED, '✗', colors);
}

export { BOLD, GRAY, GREEN, INDIGO, ORANGE, RED, RESET, YELLOW };
