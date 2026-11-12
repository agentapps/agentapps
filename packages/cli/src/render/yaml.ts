/**
 * @agentapps/cli — YAML renderer.
 *
 * Minimal YAML dumper (no external dependencies) for the CLI result shape.
 */

import type { CommandResult, Renderer, ResultValue } from './types.js';

export class YamlRenderer implements Renderer {
  render(result: CommandResult): string {
    const { layout: _layout, ...rest } = result;
    return dumpYaml(rest as unknown as Record<string, ResultValue>);
  }
}

function dumpYaml(value: ResultValue, indent = 0): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return dumpString(value, indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((item) => `${' '.repeat(indent)}- ${dumpYaml(item, indent + 2)}`).join('\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    return entries
      .map(([key, val]) => {
        if (isScalar(val)) {
          return `${' '.repeat(indent)}${key}: ${dumpYaml(val, 0)}`;
        }
        return `${' '.repeat(indent)}${key}:\n${dumpYaml(val, indent + 2)}`;
      })
      .join('\n');
  }
  return String(value);
}

function dumpString(value: string, _indent: number): string {
  if (value === '') return '""';
  if (/^[\s]|[\s]$/.test(value) || /[\n\r:]/.test(value) || value === '~' || value === 'null') {
    const quote = value.includes('"') && !value.includes("'") ? "'" : '"';
    const escaped = quote === '"' ? value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') : value;
    return `${quote}${escaped}${quote}`;
  }
  return value;
}

function isScalar(value: ResultValue): boolean {
  return value === null || typeof value !== 'object';
}
