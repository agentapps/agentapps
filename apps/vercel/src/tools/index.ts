import type { AgentApp } from '@agentapps/sdk';
import { registerAddDomainTool } from './add-domain.js';
import { registerCancelDeploymentTool } from './cancel-deployment.js';
import { registerCreateEnvVarTool } from './create-env-var.js';
import { registerDeleteEnvVarTool } from './delete-env-var.js';
import { registerGetDeploymentTool } from './get-deployment.js';
import { registerGetDeploymentEventsTool } from './get-deployment-events.js';
import { registerGetDomainTool } from './get-domain.js';
import { registerGetProjectTool } from './get-project.js';
import { registerListAliasesTool } from './list-aliases.js';
import { registerListDeploymentsTool } from './list-deployments.js';
import { registerListDomainsTool } from './list-domains.js';
import { registerListEnvVarsTool } from './list-env-vars.js';
import { registerListProjectsTool } from './list-projects.js';
import { registerListTeamsTool } from './list-teams.js';
import { registerRedeployTool } from './redeploy.js';

export function registerTools(app: AgentApp): void {
  registerListProjectsTool(app);
  registerGetProjectTool(app);
  registerListDeploymentsTool(app);
  registerGetDeploymentTool(app);
  registerListDomainsTool(app);
  registerGetDomainTool(app);
  registerAddDomainTool(app);
  registerListEnvVarsTool(app);
  registerCreateEnvVarTool(app);
  registerDeleteEnvVarTool(app);
  registerListTeamsTool(app);
  registerGetDeploymentEventsTool(app);
  registerCancelDeploymentTool(app);
  registerRedeployTool(app);
  registerListAliasesTool(app);
}
