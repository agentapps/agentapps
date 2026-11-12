import type { AgentApp } from '@agentapps/sdk';
import { registerCopyFileTool } from './copy-file.js';
import { registerCreateCommentTool } from './create-comment.js';
import { registerCreateDocumentTool } from './create-document.js';
import { registerCreateFolderTool } from './create-folder.js';
import { registerCreateReplyTool } from './create-reply.js';
import { registerDeleteCommentTool } from './delete-comment.js';
import { registerDeleteFileTool } from './delete-file.js';
import { registerDownloadFileTool } from './download-file.js';
import { registerGetCommentTool } from './get-comment.js';
import { registerGetFileTool } from './get-file.js';
import { registerGetFileContentTool } from './get-file-content.js';
import { registerListCommentsTool } from './list-comments.js';
import { registerListFilesTool } from './list-files.js';
import { registerListRepliesTool } from './list-replies.js';
import { registerMoveFileTool } from './move-file.js';
import { registerSearchFilesTool } from './search-files.js';
import { registerShareFileTool } from './share-file.js';
import { registerUpdateCommentTool } from './update-comment.js';
import { registerUploadFileTool } from './upload-file.js';

export function registerTools(app: AgentApp): void {
  // File operations
  registerListFilesTool(app);
  registerGetFileTool(app);
  registerDownloadFileTool(app);
  registerUploadFileTool(app);
  registerCreateDocumentTool(app);
  registerCreateFolderTool(app);
  registerDeleteFileTool(app);
  registerShareFileTool(app);
  registerSearchFilesTool(app);
  registerMoveFileTool(app);
  registerCopyFileTool(app);
  registerGetFileContentTool(app);

  // Comments
  registerListCommentsTool(app);
  registerGetCommentTool(app);
  registerCreateCommentTool(app);
  registerUpdateCommentTool(app);
  registerDeleteCommentTool(app);
  registerCreateReplyTool(app);
  registerListRepliesTool(app);
}
