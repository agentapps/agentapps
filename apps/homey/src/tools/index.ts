import type { AgentApp } from '@agentapps/sdk';
import { registerGetDeviceTool } from './get-device.js';
import { registerGetEnergyTool } from './get-energy.js';
import { registerGetSystemInfoTool } from './get-system-info.js';
import { registerGetUserTool } from './get-user.js';
import { registerGetVariablesTool } from './get-variables.js';
import { registerListAppsTool } from './list-apps.js';
import { registerListDevicesTool } from './list-devices.js';
import { registerListFlowsTool } from './list-flows.js';
import { registerListNotificationsTool } from './list-notifications.js';
import { registerListZonesTool } from './list-zones.js';
import { registerSetCapabilityTool } from './set-capability.js';
import { registerSetVariableTool } from './set-variable.js';
import { registerTriggerFlowTool } from './trigger-flow.js';

export function registerTools(app: AgentApp): void {
  registerGetUserTool(app);
  registerListDevicesTool(app);
  registerGetDeviceTool(app);
  registerSetCapabilityTool(app);
  registerListFlowsTool(app);
  registerTriggerFlowTool(app);
  registerListZonesTool(app);
  registerGetSystemInfoTool(app);
  registerListNotificationsTool(app);
  registerGetVariablesTool(app);
  registerSetVariableTool(app);
  registerListAppsTool(app);
  registerGetEnergyTool(app);
}
