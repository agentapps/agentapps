/**
 * @agentapps/cli — public API.
 *
 * Exports the pieces needed to drive the CLI programmatically or test it.
 */

export { parseGlobalArgs } from './args.js';
export * from './commands/index.js';
export { bashCompletionScript, zshCompletionScript } from './completions.js';
export { findConfigPath, loadWorkspaceConfig, resolveSourcePath } from './config.js';
export { dispatchCommand } from './dispatch.js';
export type { FileServerOptions } from './file-server.js';
export { FileServer } from './file-server.js';
export { GLOBAL_HELP, printHelp } from './help.js';
export { readLine, requestRemoteAuth } from './prompt.js';
export { createRenderer, HumanRenderer, JsonRenderer, YamlRenderer } from './render/index.js';
export type { CommandResult, Renderer, RenderOptions, ResultValue } from './render/types.js';
export { startRepl } from './repl.js';
export type { ReplCommand } from './repl-parser.js';
export { getCompletions, parseReplLine, tokenize } from './repl-parser.js';
export { resolveApp } from './resolve.js';
export * from './state.js';
export {
  StationClient,
  StationError,
  StationUnreachableError,
  stationFailure,
} from './station-client.js';
export { StationSession, StationSessions } from './station-session.js';
export { parseToolArgs } from './tool-args.js';
export type {
  AppConfigEntry,
  CliContext,
  GlobalOptions,
  HandlerResult,
  ResolvedApp,
  WorkspaceConfig,
} from './types.js';
export {
  createWorkspaceStation,
  type WorkspaceStation,
  type WorkspaceStationOptions,
} from './workspace-station.js';
