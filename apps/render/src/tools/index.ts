import type { AgentApp } from '@agentapps/sdk';
import { registerAddCustomDomainTool } from './add-custom-domain.js';
import { registerAddDiskTool } from './add-disk.js';
import { registerCancelDeployTool } from './cancel-deploy.js';
import { registerCreateEnvironmentTool } from './create-environment.js';
import { registerCreateProjectTool } from './create-project.js';
import { registerCreateServiceTool } from './create-service.js';
import { registerDeleteCustomDomainTool } from './delete-custom-domain.js';
import { registerDeleteEnvVarTool } from './delete-env-var.js';
import { registerDeleteProjectTool } from './delete-project.js';
import { registerDeleteServiceTool } from './delete-service.js';
import { registerGetDeployTool } from './get-deploy.js';
import { registerGetLogsTool } from './get-logs.js';
import { registerGetProjectTool } from './get-project.js';
import { registerGetServiceTool } from './get-service.js';
import { registerGetUserTool } from './get-user.js';
import { registerListCustomDomainsTool } from './list-custom-domains.js';
import { registerListDeploysTool } from './list-deploys.js';
import { registerListDisksTool } from './list-disks.js';
import { registerListEnvVarsTool } from './list-env-vars.js';
import { registerListEnvironmentsTool } from './list-environments.js';
import { registerListOwnersTool } from './list-owners.js';
import { registerListProjectsTool } from './list-projects.js';
import { registerListServicesTool } from './list-services.js';
import { registerRestartServiceTool } from './restart-service.js';
import { registerResumeServiceTool } from './resume-service.js';
import { registerRollbackDeployTool } from './rollback-deploy.js';
import { registerSetEnvVarsTool } from './set-env-vars.js';
import { registerSuspendServiceTool } from './suspend-service.js';
import { registerTriggerDeployTool } from './trigger-deploy.js';
import { registerUpdateEnvVarTool } from './update-env-var.js';
import { registerVerifyCustomDomainTool } from './verify-custom-domain.js';

export function registerTools(app: AgentApp): void {
  // User & owners
  registerGetUserTool(app);
  registerListOwnersTool(app);

  // Projects
  registerListProjectsTool(app);
  registerGetProjectTool(app);
  registerCreateProjectTool(app);
  registerDeleteProjectTool(app);

  // Environments
  registerListEnvironmentsTool(app);
  registerCreateEnvironmentTool(app);

  // Services
  registerListServicesTool(app);
  registerGetServiceTool(app);
  registerCreateServiceTool(app);
  registerDeleteServiceTool(app);
  registerSuspendServiceTool(app);
  registerResumeServiceTool(app);
  registerRestartServiceTool(app);

  // Deployments
  registerListDeploysTool(app);
  registerGetDeployTool(app);
  registerTriggerDeployTool(app);
  registerCancelDeployTool(app);
  registerRollbackDeployTool(app);

  // Environment variables
  registerListEnvVarsTool(app);
  registerSetEnvVarsTool(app);
  registerUpdateEnvVarTool(app);
  registerDeleteEnvVarTool(app);

  // Custom domains
  registerListCustomDomainsTool(app);
  registerAddCustomDomainTool(app);
  registerDeleteCustomDomainTool(app);
  registerVerifyCustomDomainTool(app);

  // Disks
  registerListDisksTool(app);
  registerAddDiskTool(app);

  // Logs
  registerGetLogsTool(app);
}
