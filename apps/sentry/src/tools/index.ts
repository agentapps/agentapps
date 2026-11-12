import type { AgentApp } from '@agentapps/sdk';
import { registerAssignIssueTool } from './assign-issue.js';
import { registerCreateReleaseTool } from './create-release.js';
import { registerGetEventTool } from './get-event.js';
import { registerGetIssueTool } from './get-issue.js';
import { registerGetProjectTool } from './get-project.js';
import { registerGetReleaseTool } from './get-release.js';
import { registerIgnoreIssueTool } from './ignore-issue.js';
import { registerListAlertsTool } from './list-alerts.js';
import { registerListEventsTool } from './list-events.js';
import { registerListIssuesTool } from './list-issues.js';
import { registerListOrganizationsTool } from './list-organizations.js';
import { registerListProjectsTool } from './list-projects.js';
import { registerListReleasesTool } from './list-releases.js';
import { registerListTeamsTool } from './list-teams.js';
import { registerResolveIssueTool } from './resolve-issue.js';

export function registerTools(app: AgentApp): void {
  registerListOrganizationsTool(app);
  registerListProjectsTool(app);
  registerGetProjectTool(app);
  registerListIssuesTool(app);
  registerGetIssueTool(app);
  registerListEventsTool(app);
  registerGetEventTool(app);
  registerResolveIssueTool(app);
  registerIgnoreIssueTool(app);
  registerAssignIssueTool(app);
  registerListReleasesTool(app);
  registerGetReleaseTool(app);
  registerCreateReleaseTool(app);
  registerListTeamsTool(app);
  registerListAlertsTool(app);
}
