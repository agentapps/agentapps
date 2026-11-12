import type { AgentApp } from '@agentapps/sdk';
import { registerAddCommentTool } from './add-comment.js';
import { registerCreateFolderTool } from './create-folder.js';
import { registerCreateListTool } from './create-list.js';
import { registerCreateTaskTool } from './create-task.js';
import { registerDeleteTaskTool } from './delete-task.js';
import { registerGetCommentsTool } from './get-comments.js';
import { registerGetFoldersTool } from './get-folders.js';
import { registerGetListsTool } from './get-lists.js';
import { registerGetMembersTool } from './get-members.js';
import { registerGetSpacesTool } from './get-spaces.js';
import { registerGetTaskTool } from './get-task.js';
import { registerGetTasksTool } from './get-tasks.js';
import { registerGetUserTool } from './get-user.js';
import { registerGetWorkspacesTool } from './get-workspaces.js';
import { registerSearchTasksTool } from './search-tasks.js';
import { registerUpdateTaskTool } from './update-task.js';

export function registerTools(app: AgentApp): void {
  registerGetUserTool(app);
  registerGetWorkspacesTool(app);
  registerGetMembersTool(app);
  registerGetSpacesTool(app);
  registerGetFoldersTool(app);
  registerCreateFolderTool(app);
  registerGetListsTool(app);
  registerCreateListTool(app);
  registerGetTasksTool(app);
  registerGetTaskTool(app);
  registerCreateTaskTool(app);
  registerUpdateTaskTool(app);
  registerDeleteTaskTool(app);
  registerSearchTasksTool(app);
  registerAddCommentTool(app);
  registerGetCommentsTool(app);
}
