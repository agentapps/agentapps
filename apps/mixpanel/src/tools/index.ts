import type { AgentApp } from '@agentapps/sdk';
import { registerExportEventsTool } from './export-events.js';
import { registerGetCohortTool } from './get-cohort.js';
import { registerGetEventNamesTool } from './get-event-names.js';
import { registerGetFunnelTool } from './get-funnel.js';
import { registerGetPropertyValuesTool } from './get-property-values.js';
import { registerGetRetentionTool } from './get-retention.js';
import { registerGetSegmentationTool } from './get-segmentation.js';
import { registerGetTopEventsTool } from './get-top-events.js';
import { registerGetUserProfileTool } from './get-user-profile.js';
import { registerListCohortsTool } from './list-cohorts.js';
import { registerListDashboardsTool } from './list-dashboards.js';
import { registerListFunnelsTool } from './list-funnels.js';
import { registerQueryEventsTool } from './query-events.js';

export function registerTools(app: AgentApp): void {
  registerQueryEventsTool(app);
  registerGetFunnelTool(app);
  registerListFunnelsTool(app);
  registerGetRetentionTool(app);
  registerGetSegmentationTool(app);
  registerGetUserProfileTool(app);
  registerListCohortsTool(app);
  registerExportEventsTool(app);
  registerGetCohortTool(app);
  registerListDashboardsTool(app);
  registerGetTopEventsTool(app);
  registerGetEventNamesTool(app);
  registerGetPropertyValuesTool(app);
}
