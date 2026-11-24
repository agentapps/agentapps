/**
 * @agentapps/cli — command handlers.
 */

export { handleApprovalDecide, handleApprovals } from './approvals.js';

export { handleAuth } from './auth.js';
export { handleBind } from './bind.js';
export { handleConfig } from './config.js';
export { handleInfo } from './info.js';
export { handleInstall } from './install.js';
export { handleKeyCreate, handleKeyList, handleKeyRevoke } from './keys.js';
export { handleList } from './list.js';
export { handleListApps } from './list-apps.js';
export { handleListBindings } from './list-bindings.js';
export { handlePermissions, handlePermissionsRemove, handlePermissionsSet } from './permissions.js';
export {
  handlePolicyDelete,
  handlePolicyList,
  handlePolicySet,
  handlePolicyShow,
  handlePolicyUnset,
} from './policies.js';
export { handleRename } from './rename.js';
export { handleServe } from './serve.js';
export { handleStation } from './station.js';
export {
  handleStationApps,
  handleStationLogin,
  handleStationLogout,
  handleStationUse,
} from './station-connection.js';
export { handleStatus } from './status.js';
export { handleSubscribe } from './subscribe.js';
export { handleSync } from './sync.js';
export { handleTool } from './tool.js';
export { handleTools } from './tools.js';
export type { CommandHandler, HandlerContext } from './types.js';
export { handleUnbind } from './unbind.js';
export { handleUninstall } from './uninstall.js';
export { handleWarm } from './warm.js';
