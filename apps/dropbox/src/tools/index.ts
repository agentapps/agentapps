import type { AgentApp } from '@agentapps/sdk';
import { registerCopyFileTool } from './copy-file.js';
import { registerCreateFolderTool } from './create-folder.js';
import { registerCreateSharedLinkTool } from './create-shared-link.js';
import { registerDeleteFileTool } from './delete-file.js';
import { registerGetAccountTool } from './get-account.js';
import { registerGetMetadataTool } from './get-metadata.js';
import { registerGetSpaceUsageTool } from './get-space-usage.js';
import { registerGetTemporaryLinkTool } from './get-temporary-link.js';
import { registerListFileRequestsTool } from './list-file-requests.js';
import { registerListFolderTool } from './list-folder.js';
import { registerListFolderContinueTool } from './list-folder-continue.js';
import { registerListSharedLinksTool } from './list-shared-links.js';
import { registerMoveFileTool } from './move-file.js';
import { registerRevokeSharedLinkTool } from './revoke-shared-link.js';
import { registerSaveUrlTool } from './save-url.js';
import { registerSearchFilesTool } from './search-files.js';

/**
 * Register all 16 Dropbox tools on the given app instance.
 */
export function registerTools(app: AgentApp): void {
  registerListFolderTool(app);
  registerGetMetadataTool(app);
  registerSearchFilesTool(app);
  registerCreateFolderTool(app);
  registerDeleteFileTool(app);
  registerMoveFileTool(app);
  registerCopyFileTool(app);
  registerCreateSharedLinkTool(app);
  registerGetAccountTool(app);
  registerListSharedLinksTool(app);
  registerRevokeSharedLinkTool(app);
  registerListFolderContinueTool(app);
  registerGetTemporaryLinkTool(app);
  registerGetSpaceUsageTool(app);
  registerListFileRequestsTool(app);
  registerSaveUrlTool(app);
}
