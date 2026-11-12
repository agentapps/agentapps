/**
 * @agentapps/cli — tool argument parser.
 *
 * Parses arguments after `<alias> tool <toolName>` into a JSON object.
 * Supports named key:value pairs and a single inline JSON object.
 */

import { readFileSync } from 'node:fs';

export interface ParsedToolArgs {
  args: Record<string, unknown>;
}

/** Parse tool arguments from the REPL line. */
export function parseToolArgs(tokens: string[]): ParsedToolArgs {
  if (tokens.length === 0) {
    return { args: {} };
  }

  // Single dash means read JSON from stdin.
  if (tokens.length === 1 && tokens[0] === '-') {
    return { args: readStdinJson() };
  }

  // Single inline JSON object.
  if (tokens.length === 1 && (tokens[0].startsWith('{') || tokens[0].startsWith('['))) {
    return { args: parseJsonObject(tokens[0]) };
  }

  // Named arguments.
  const named: Record<string, unknown> = {};
  for (const token of tokens) {
    if (token.startsWith('{') || token.startsWith('[')) {
      throw new Error('Invalid tool arguments: cannot mix JSON and key:value arguments');
    }
    const colonIndex = token.indexOf(':');
    if (colonIndex <= 0) {
      throw new Error(`Invalid named argument: ${token}`);
    }
    const key = token.slice(0, colonIndex);
    let value = token.slice(colonIndex + 1);
    value = unquote(value);
    named[key] = parseValue(value);
  }
  return { args: named };
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseValue(value: string): unknown {
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid JSON value: ${message}`);
    }
  }
  // Coerce simple scalar literals so `count:3` becomes a number and `enabled:true` a boolean.
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Tool arguments must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Tool arguments')) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON tool arguments: ${message}`);
  }
}

function readStdinJson(): Record<string, unknown> {
  const raw = readFileSync(0, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Stdin payload must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Stdin payload')) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid stdin JSON payload: ${message}`);
  }
}
