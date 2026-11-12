import type { AgentApp } from '@agentapps/sdk';
import { registerDeploySiteTool } from './deploy-site.js';
import { registerGetDeployStatusTool } from './get-deploy-status.js';
import { registerListSitesTool } from './list-sites.js';

export function registerTools(app: AgentApp): void {
  registerDeploySiteTool(app);
  registerListSitesTool(app);
  registerGetDeployStatusTool(app);
}
