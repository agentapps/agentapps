/**
 * @agentapps/cli — ANSI color helpers.
 */

export const RESET = '\x1b[0m';
export const BOLD = '\x1b[1m';
export const INDIGO = '\x1b[38;5;63m';
export const CYAN = '\x1b[36m';
export const GREEN = '\x1b[32m';
export const YELLOW = '\x1b[33m';
export const ORANGE = '\x1b[38;5;208m';
export const RED = '\x1b[31m';
export const GRAY = '\x1b[90m';
export const WHITE = '\x1b[37m';

export interface ColorOptions {
  enabled: boolean;
}

export function color(code: string, text: string, options: ColorOptions): string {
  return options.enabled ? `${code}${text}${RESET}` : text;
}

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}
