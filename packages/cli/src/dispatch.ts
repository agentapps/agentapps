/**
 * @agentapps/cli — command dispatch.
 */

import { handleConnect } from './commands/connect.js';
import { installClaudeCodeHooks, runClaudeCodeHook } from './commands/hooks-claude-code.js';
import {
  handleApprovalDecide,
  handleApprovals,
  handleAuth,
  handleBind,
  handleConfig,
  handleInfo,
  handleInstall,
  handleKeyCreate,
  handleKeyList,
  handleKeyRevoke,
  handleList,
  handleListApps,
  handleListBindings,
  handlePermissions,
  handlePermissionsRemove,
  handlePermissionsSet,
  handlePolicyDelete,
  handlePolicyList,
  handlePolicySet,
  handlePolicyShow,
  handlePolicyUnset,
  handleRename,
  handleServe,
  handleStation,
  handleStationApps,
  handleStationLogin,
  handleStationLogout,
  handleStationUse,
  handleStatus,
  handleSubscribe,
  handleSync,
  handleTool,
  handleTools,
  handleUnbind,
  handleUninstall,
  handleWarm,
} from './commands/index.js';
import { runMcp } from './commands/mcp.js';
import type { HandlerContext } from './commands/types.js';
import type { ReplCommand } from './repl-parser.js';
import type { HandlerResult } from './types.js';

export async function dispatchCommand(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  switch (command.type) {
    case 'apps':
      return handleListApps(command, context);
    case 'installations':
      return handleList(command, context);
    case 'info':
      return handleInfo(command, context);
    case 'install':
      return handleInstall(command, context);
    case 'uninstall':
      return handleUninstall(command, context);
    case 'rename':
      return handleRename(command, context);
    case 'status':
      return handleStatus(command, context);
    case 'config':
      return handleConfig(command, context);
    case 'auth':
      return handleAuth(command, context);
    case 'tools':
      return handleTools(command, context);
    case 'tool':
      return handleTool(command, context);
    case 'subscribe':
      return handleSubscribe(command, context);
    case 'bind':
      return handleBind(command, context);
    case 'unbind':
      return handleUnbind(command, context);
    case 'list-bindings':
      return handleListBindings(command, context);
    case 'policy-list':
      return handlePolicyList(command, context);
    // @spec POLICY-REQ-3
    case 'policy-unset':
      return handlePolicyUnset(command, context);
    // @spec POLICY-REQ-7
    // @spec HOOK-REQ-26
    case 'hooks-claude-code':
      return runClaudeCodeHook(context.ctx.configPath, command.event, await readStdin());
    // @spec HOOK-REQ-26
    case 'hooks-claude-code-install':
      return installClaudeCodeHooks(command.settingsPath);
    // @spec POLICY-REQ-7
    case 'approvals':
      return handleApprovals(command, context);
    // @spec POLICY-REQ-7
    case 'approval-decide':
      return handleApprovalDecide(command, context);
    case 'policy-show':
      return handlePolicyShow(command, context);
    case 'policy-set':
      return handlePolicySet(command, context);
    case 'policy-delete':
      return handlePolicyDelete(command, context);
    case 'key-list':
      return handleKeyList(command, context);
    case 'key-create':
      return handleKeyCreate(command, context);
    case 'key-revoke':
      return handleKeyRevoke(command, context);
    // @spec CLI-REQ-5
    case 'connect':
      return handleConnect(command, context);
    // @spec CLI-REQ-6
    case 'mcp':
      return runMcp(context.ctx.configPath, command.keyName);
    case 'permissions':
      return handlePermissions(command, context);
    case 'permissions-set':
      return handlePermissionsSet(command, context);
    case 'permissions-remove':
      return handlePermissionsRemove(command, context);
    case 'serve':
      return handleServe(command, context);
    case 'station':
      return handleStation(command, context);
    // @spec CLIENT-REQ-9
    case 'station-use':
      return handleStationUse(command, context);
    // @spec CLIENT-REQ-8
    case 'station-login':
      return handleStationLogin(command, context);
    // @spec CLIENT-REQ-8
    case 'station-logout':
      return handleStationLogout(command, context);
    // @spec STADMIN-REQ-9
    case 'station-apps':
      return handleStationApps(command, context);
    case 'warm':
      return handleWarm(command, context);
    case 'sync':
      return handleSync(command, context);
    case 'help':
      return { success: true, exitCode: 0 };
    case 'exit':
      return { success: true, exitCode: 0 };
    case 'clear':
      return { success: true, exitCode: 0 };
    case 'usage':
      return {
        success: false,
        exitCode: 2,
        error: {
          message: `Incomplete command: ${command.command}`,
          suggestion: `Usage: ${command.usage}`,
        },
      };
    case 'unknown':
      return {
        success: false,
        exitCode: 2,
        error: {
          message: command.token ? `Unknown command: ${command.token}` : 'Empty command',
          suggestion: 'Run "help" to see available commands.',
        },
      };
  }
}

/** All of stdin, or nothing when it is a terminal. */
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
