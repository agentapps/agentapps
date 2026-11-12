import type { AgentApp } from '@agentapps/sdk';
import { registerAddCommentTool } from './add-comment.js';
import { registerAssignIssueTool } from './assign-issue.js';
import { registerCreateIssueTool } from './create-issue.js';
import { registerGetIssueTool } from './get-issue.js';
import { registerGetMyselfTool } from './get-myself.js';
import { registerGetProjectTool } from './get-project.js';
import { registerGetSprintTool } from './get-sprint.js';
import { registerGetTransitionsTool } from './get-transitions.js';
import { registerListBoardsTool } from './list-boards.js';
import { registerListProjectsTool } from './list-projects.js';
import { registerListSprintsTool } from './list-sprints.js';
import { registerSearchIssuesTool } from './search-issues.js';
import { registerSearchUsersTool } from './search-users.js';
import { registerTransitionIssueTool } from './transition-issue.js';
import { registerUpdateIssueTool } from './update-issue.js';

export function registerTools(app: AgentApp): void {
  registerSearchIssuesTool(app);
  registerGetIssueTool(app);
  registerCreateIssueTool(app);
  registerUpdateIssueTool(app);
  registerTransitionIssueTool(app);
  registerGetTransitionsTool(app);
  registerAddCommentTool(app);
  registerListProjectsTool(app);
  registerGetProjectTool(app);
  registerGetMyselfTool(app);
  registerAssignIssueTool(app);
  registerListBoardsTool(app);
  registerListSprintsTool(app);
  registerGetSprintTool(app);
  registerSearchUsersTool(app);
}
