/**
 * @agentapps/cli — global flag parser.
 *
 * Parses global flags and returns the remaining REPL command tokens.
 */

export interface ParsedGlobalArgs {
  options: {
    config?: string;
    cwd?: string;
    json: boolean;
    yaml: boolean;
    raw: boolean;
    manualCode: boolean;
    /** Print OAuth URL without starting a callback server or waiting. */
    urlOnly: boolean;
    yes: boolean;
    verbose: boolean;
    help: boolean;
    /** Internal: run `serve` in the foreground (used by the detached worker). */
    foreground?: boolean;
    /** The public URL of the Station that `serve` and `station start` launch (SETUP-REQ-11). */
    publicUrl?: string;
  };
  commandTokens: string[];
}

/** Parse global flags and return the remaining REPL command tokens. */
export function parseGlobalArgs(argv: string[]): ParsedGlobalArgs {
  const options: ParsedGlobalArgs['options'] = {
    json: false,
    yaml: false,
    raw: false,
    manualCode: false,
    urlOnly: false,
    yes: false,
    verbose: false,
    help: false,
  };
  const commandTokens: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config') {
      options.config = argv[++i];
    } else if (arg === '--cwd') {
      options.cwd = argv[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--yaml') {
      options.yaml = true;
    } else if (arg === '--raw') {
      options.raw = true;
    } else if (arg === '--manual-code') {
      options.manualCode = true;
    } else if (arg === '--url-only') {
      options.urlOnly = true;
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--foreground') {
      // Internal: used by the detached `serve` worker. Not documented in help.
      options.foreground = true;
    } else if (arg === '--public-url') {
      // SETUP-REQ-11: the Station's public URL, for `serve` and `station start`.
      options.publicUrl = argv[++i];
    } else if (arg === '--remove') {
      // Belongs to `connect <client> --remove`; the command parser reads it.
      commandTokens.push(arg);
    } else if (arg.startsWith('-') && arg !== '-') {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      commandTokens.push(arg);
    }
  }

  return { options, commandTokens };
}
