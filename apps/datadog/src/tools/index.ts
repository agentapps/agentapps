import type { AgentApp } from '@agentapps/sdk';
import { registerCreateMonitorTool } from './create-monitor.js';
import { registerGetDashboardTool } from './get-dashboard.js';
import { registerGetIncidentTool } from './get-incident.js';
import { registerGetMonitorTool } from './get-monitor.js';
import { registerListDashboardsTool } from './list-dashboards.js';
import { registerListDowntimesTool } from './list-downtimes.js';
import { registerListIncidentsTool } from './list-incidents.js';
import { registerListMonitorsTool } from './list-monitors.js';
import { registerMuteMonitorTool } from './mute-monitor.js';
import { registerQueryMetricsTool } from './query-metrics.js';
import { registerSearchLogsTool } from './search-logs.js';

export function registerTools(app: AgentApp): void {
  registerCreateMonitorTool(app);
  registerGetDashboardTool(app);
  registerGetIncidentTool(app);
  registerGetMonitorTool(app);
  registerListDashboardsTool(app);
  registerListDowntimesTool(app);
  registerListIncidentsTool(app);
  registerListMonitorsTool(app);
  registerMuteMonitorTool(app);
  registerQueryMetricsTool(app);
  registerSearchLogsTool(app);
}
