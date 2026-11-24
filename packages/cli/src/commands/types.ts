/**
 * @agentapps/cli — command handler types.
 */

import type { ReplCommand } from '../repl-parser.js';
import type { StationSessions } from '../station-session.js';
import type { CliContext, GlobalOptions } from '../types.js';

export interface HandlerContext {
  ctx: CliContext;
  options: GlobalOptions;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  /**
   * Persistent per-alias sessions (REPL only). When present, tool commands
   * reuse one live session per instance instead of opening and closing one
   * per invocation — stateful apps keep their state across commands.
   */
  sessions?: StationSessions;
}

export type CommandHandler = (
  command: ReplCommand,
  context: HandlerContext,
) => Promise<import('../types.js').HandlerResult>;
