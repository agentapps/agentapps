import type { AgentApp } from '@agentapps/sdk';
import { registerExecuteTool } from './execute.js';
import { registerListDevicesTool } from './list-devices.js';
import { registerListNotificationsTool } from './list-notifications.js';
import { registerSendNotificationTool } from './send-notification.js';

export function registerTools(app: AgentApp): void {
  registerSendNotificationTool(app);
  registerExecuteTool(app);
  registerListDevicesTool(app);
  registerListNotificationsTool(app);
}
