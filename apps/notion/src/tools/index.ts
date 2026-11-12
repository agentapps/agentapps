import type { AgentApp } from '@agentapps/sdk';
import { registerAppendBlocksTool } from './append-blocks.js';
import { registerCreateAdvancedBlocksTool } from './create-advanced-blocks.js';
import { registerCreateColumnLayoutTool } from './create-column-layout.js';
import { registerCreateCommentTool } from './create-comment.js';
import { registerCreateDatabaseTool } from './create-database.js';
import { registerCreateDatabaseItemTool } from './create-database-item.js';
import { registerCreatePageTool } from './create-page.js';
import { registerDeleteBlockTool } from './delete-block.js';
import { registerDeleteCommentTool } from './delete-comment.js';
import { registerDuplicatePageTool } from './duplicate-page.js';
// Blocks
import { registerGetBlockTool } from './get-block.js';
import { registerGetBlockChildrenTool } from './get-block-children.js';
import { registerGetBlocksTool } from './get-blocks.js';
// Databases
import { registerGetDatabaseTool } from './get-database.js';
import { registerGetMeTool } from './get-me.js';
// Pages
import { registerGetPageTool } from './get-page.js';
import { registerGetPageMarkdownTool } from './get-page-markdown.js';
import { registerGetUserTool } from './get-user.js';
// Comments
import { registerListCommentsTool } from './list-comments.js';
// Users
import { registerListUsersTool } from './list-users.js';
import { registerQueryDatabaseTool } from './query-database.js';
// Search
import { registerSearchTool } from './search.js';
import { registerSetPageCoverTool } from './set-page-cover.js';
import { registerSetPageIconTool } from './set-page-icon.js';
import { registerUpdateBlockTool } from './update-block.js';
import { registerUpdateCommentTool } from './update-comment.js';
import { registerUpdateDatabaseItemTool } from './update-database-item.js';
import { registerUpdateDatabaseSchemaTool } from './update-database-schema.js';
import { registerUpdatePageTool } from './update-page.js';
import { registerUpdatePageMarkdownTool } from './update-page-markdown.js';

// File uploads
import { registerUploadFileTool } from './upload-file.js';

/**
 * Register all 31 Notion tools on the given app instance.
 */
export function registerTools(app: AgentApp): void {
  // Search
  registerSearchTool(app);

  // Pages
  registerGetPageTool(app);
  registerGetPageMarkdownTool(app);
  registerCreatePageTool(app);
  registerUpdatePageTool(app);
  registerUpdatePageMarkdownTool(app);
  registerSetPageIconTool(app);
  registerSetPageCoverTool(app);
  registerDuplicatePageTool(app);

  // Databases
  registerGetDatabaseTool(app);
  registerQueryDatabaseTool(app);
  registerCreateDatabaseTool(app);
  registerUpdateDatabaseSchemaTool(app);
  registerCreateDatabaseItemTool(app);
  registerUpdateDatabaseItemTool(app);

  // Blocks
  registerGetBlockTool(app);
  registerGetBlocksTool(app);
  registerGetBlockChildrenTool(app);
  registerAppendBlocksTool(app);
  registerUpdateBlockTool(app);
  registerDeleteBlockTool(app);
  registerCreateColumnLayoutTool(app);
  registerCreateAdvancedBlocksTool(app);

  // Users
  registerListUsersTool(app);
  registerGetUserTool(app);
  registerGetMeTool(app);

  // Comments
  registerListCommentsTool(app);
  registerCreateCommentTool(app);
  registerUpdateCommentTool(app);
  registerDeleteCommentTool(app);

  // File uploads
  registerUploadFileTool(app);
}
