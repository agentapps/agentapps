import type { AgentApp } from '@agentapps/sdk';
import { registerCloneScenarioTool } from './clone-scenario.js';
import { registerCreateScenarioTool } from './create-scenario.js';
import { registerDeleteScenarioTool } from './delete-scenario.js';
import { registerGetScenarioTool } from './get-scenario.js';
import { registerGetScenarioBlueprintTool } from './get-scenario-blueprint.js';
import { registerListScenariosTool } from './list-scenarios.js';
import { registerRunScenarioTool } from './run-scenario.js';
import { registerStartScenarioTool } from './start-scenario.js';
import { registerStopScenarioTool } from './stop-scenario.js';
import { registerTriggerWebhookTool } from './trigger-webhook.js';
import { registerUpdateScenarioTool } from './update-scenario.js';

export function registerTools(app: AgentApp): void {
  registerTriggerWebhookTool(app);
  registerListScenariosTool(app);
  registerRunScenarioTool(app);
  registerCreateScenarioTool(app);
  registerGetScenarioTool(app);
  registerGetScenarioBlueprintTool(app);
  registerUpdateScenarioTool(app);
  registerDeleteScenarioTool(app);
  registerCloneScenarioTool(app);
  registerStartScenarioTool(app);
  registerStopScenarioTool(app);
}
