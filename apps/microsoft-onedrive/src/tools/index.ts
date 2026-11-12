import type { AgentApp } from '@agentapps/sdk';
import { registerConvertFileTool } from './convert-file.js';
import { registerCopyItemTool } from './copy-item.js';
import { registerCreateFolderTool } from './create-folder.js';
import { registerCreateShareLinkTool } from './create-share-link.js';
import { registerDeleteItemTool } from './delete-item.js';
import { registerDownloadFileTool } from './download-file.js';
import { registerGetDriveInfoTool } from './get-drive-info.js';
import { registerGetFileContentTool } from './get-file-content.js';
import { registerGetItemTool } from './get-item.js';
import { registerInvitePeopleTool } from './invite-people.js';
import { registerListItemsTool } from './list-items.js';
import { registerListPermissionsTool } from './list-permissions.js';
import { registerListRecentTool } from './list-recent.js';
import { registerListSharedWithMeTool } from './list-shared-with-me.js';
import { registerListVersionsTool } from './list-versions.js';
import { registerMoveItemTool } from './move-item.js';
import { registerRemovePermissionTool } from './remove-permission.js';
import { registerRenameItemTool } from './rename-item.js';
import { registerSearchItemsTool } from './search-items.js';
import { registerUploadFileTool } from './upload-file.js';

export function registerTools(app: AgentApp): void {
  // Browse
  registerListItemsTool(app);
  registerGetItemTool(app);
  registerSearchItemsTool(app);

  // Content
  registerDownloadFileTool(app);
  registerGetFileContentTool(app);
  registerConvertFileTool(app);
  registerUploadFileTool(app);

  // Organize
  registerCreateFolderTool(app);
  registerCopyItemTool(app);
  registerMoveItemTool(app);
  registerRenameItemTool(app);
  registerDeleteItemTool(app);

  // Sharing
  registerCreateShareLinkTool(app);
  registerInvitePeopleTool(app);
  registerListPermissionsTool(app);
  registerRemovePermissionTool(app);

  // Discovery
  registerListSharedWithMeTool(app);
  registerListRecentTool(app);

  // Account
  registerGetDriveInfoTool(app);
  registerListVersionsTool(app);
}
