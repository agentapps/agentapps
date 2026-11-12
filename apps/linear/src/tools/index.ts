import type { AgentApp } from '@agentapps/sdk';
import { registerAddCommentTool } from './add-comment.js';
import { registerAddIssuesToProjectTool } from './add-issues-to-project.js';
import { registerAddLabelsToIssueTool } from './add-labels-to-issue.js';
import { registerArchiveIssueTool } from './archive-issue.js';
import { registerCreateIssueTool } from './create-issue.js';
import { registerCreateLabelTool } from './create-label.js';
import { registerCreateProjectTool } from './create-project.js';
import { registerDeleteIssueTool } from './delete-issue.js';
import { registerDeleteLabelTool } from './delete-label.js';
import { registerGetIssueTool } from './get-issue.js';
// Issues
import { registerListIssuesTool } from './list-issues.js';

// Labels
import { registerListLabelsTool } from './list-labels.js';
// Projects
import { registerListProjectsTool } from './list-projects.js';
// Teams / Users / Workflow
import { registerListTeamsTool } from './list-teams.js';
import { registerListUsersTool } from './list-users.js';
import { registerListWorkflowStatesTool } from './list-workflow-states.js';
import { registerRemoveIssuesFromProjectTool } from './remove-issues-from-project.js';
import { registerRemoveLabelsFromIssueTool } from './remove-labels-from-issue.js';
import { registerUpdateIssueTool } from './update-issue.js';
import { registerUpdateLabelTool } from './update-label.js';

export function registerTools(app: AgentApp): void {
  // Issues
  registerListIssuesTool(app);
  registerGetIssueTool(app);
  registerCreateIssueTool(app);
  registerUpdateIssueTool(app);
  registerDeleteIssueTool(app);
  registerArchiveIssueTool(app);
  registerAddCommentTool(app);

  // Projects
  registerListProjectsTool(app);
  registerCreateProjectTool(app);
  registerAddIssuesToProjectTool(app);
  registerRemoveIssuesFromProjectTool(app);

  // Labels
  registerListLabelsTool(app);
  registerCreateLabelTool(app);
  registerUpdateLabelTool(app);
  registerDeleteLabelTool(app);
  registerAddLabelsToIssueTool(app);
  registerRemoveLabelsFromIssueTool(app);

  // Teams / Users / Workflow
  registerListTeamsTool(app);
  registerListUsersTool(app);
  registerListWorkflowStatesTool(app);
}
