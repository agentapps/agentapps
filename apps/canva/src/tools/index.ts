import type { AgentApp } from '@agentapps/sdk';
import { registerAutofillDesignTool } from './autofill-design.js';
import { registerCreateDesignTool } from './create-design.js';
import { registerCreateFolderTool } from './create-folder.js';
import { registerCreateReplyTool } from './create-reply.js';
import { registerCreateResizeJobTool } from './create-resize-job.js';
// Comments (threads + replies)
import { registerCreateThreadTool } from './create-thread.js';
import { registerDeleteAssetTool } from './delete-asset.js';
import { registerDeleteFolderTool } from './delete-folder.js';

// Exports + Resizes
import { registerExportDesignTool } from './export-design.js';
import { registerGetAssetTool } from './get-asset.js';
import { registerGetAssetUploadJobTool } from './get-asset-upload-job.js';
import { registerGetAutofillJobTool } from './get-autofill-job.js';
import { registerGetBrandTemplateTool } from './get-brand-template.js';
import { registerGetBrandTemplateDatasetTool } from './get-brand-template-dataset.js';
import { registerGetDesignTool } from './get-design.js';
import { registerGetDesignExportFormatsTool } from './get-design-export-formats.js';
import { registerGetDesignPagesTool } from './get-design-pages.js';
import { registerGetExportJobTool } from './get-export-job.js';
import { registerGetFolderTool } from './get-folder.js';
import { registerGetImportJobTool } from './get-import-job.js';
import { registerGetReplyTool } from './get-reply.js';
import { registerGetResizeJobTool } from './get-resize-job.js';
import { registerGetThreadTool } from './get-thread.js';
// Users
import { registerGetUserTool } from './get-user.js';
import { registerGetUserCapabilitiesTool } from './get-user-capabilities.js';
import { registerGetUserProfileTool } from './get-user-profile.js';
// Imports
import { registerImportDesignTool } from './import-design.js';
// Brand templates + autofill
import { registerListBrandTemplatesTool } from './list-brand-templates.js';
// Designs
import { registerListDesignsTool } from './list-designs.js';
// Folders
import { registerListFoldersTool } from './list-folders.js';
import { registerListRepliesTool } from './list-replies.js';
import { registerMoveItemTool } from './move-item.js';
import { registerUpdateAssetTool } from './update-asset.js';
import { registerUpdateFolderTool } from './update-folder.js';
// Assets
import { registerUploadAssetTool } from './upload-asset.js';

/**
 * Register all 31 Canva tools on the given app instance.
 */
export function registerTools(app: AgentApp): void {
  // Users
  registerGetUserTool(app);
  registerGetUserProfileTool(app);
  registerGetUserCapabilitiesTool(app);

  // Designs
  registerListDesignsTool(app);
  registerGetDesignTool(app);
  registerCreateDesignTool(app);
  registerGetDesignPagesTool(app);
  registerGetDesignExportFormatsTool(app);

  // Exports + Resizes
  registerExportDesignTool(app);
  registerGetExportJobTool(app);
  registerCreateResizeJobTool(app);
  registerGetResizeJobTool(app);

  // Imports
  registerImportDesignTool(app);
  registerGetImportJobTool(app);

  // Folders
  registerListFoldersTool(app);
  registerGetFolderTool(app);
  registerCreateFolderTool(app);
  registerUpdateFolderTool(app);
  registerDeleteFolderTool(app);
  registerMoveItemTool(app);

  // Assets
  registerUploadAssetTool(app);
  registerGetAssetUploadJobTool(app);
  registerGetAssetTool(app);
  registerUpdateAssetTool(app);
  registerDeleteAssetTool(app);

  // Brand templates + autofill
  registerListBrandTemplatesTool(app);
  registerGetBrandTemplateTool(app);
  registerGetBrandTemplateDatasetTool(app);
  registerAutofillDesignTool(app);
  registerGetAutofillJobTool(app);

  // Comments (threads + replies)
  registerCreateThreadTool(app);
  registerGetThreadTool(app);
  registerListRepliesTool(app);
  registerCreateReplyTool(app);
  registerGetReplyTool(app);
}
