/**
 * Barrel file — registers all Amplitude tools on the app.
 */

import type { AgentApp } from '@agentapps/sdk';
import { registerCreateAnnotationTool } from './create-annotation.js';
import { registerDeleteAnnotationTool } from './delete-annotation.js';
import { registerExportEventsTool } from './export-events.js';
import { registerGetActiveUsersTool } from './get-active-users.js';
import { registerGetAnnotationsTool } from './get-annotations.js';
import { registerGetChartTool } from './get-chart.js';
import { registerGetCohortTool } from './get-cohort.js';
import { registerGetFunnelTool } from './get-funnel.js';
import { registerGetRetentionTool } from './get-retention.js';
import { registerGetRevenueTool } from './get-revenue.js';
import { registerGetUserActivityTool } from './get-user-activity.js';
import { registerListChartsTool } from './list-charts.js';
import { registerListCohortsTool } from './list-cohorts.js';
import { registerListEventTypesTool } from './list-event-types.js';
import { registerQueryEventsTool } from './query-events.js';
import { registerSearchUsersTool } from './search-users.js';

export function registerTools(app: AgentApp): void {
  registerQueryEventsTool(app);
  registerGetFunnelTool(app);
  registerGetRetentionTool(app);
  registerGetUserActivityTool(app);
  registerListCohortsTool(app);
  registerGetCohortTool(app);
  registerExportEventsTool(app);
  registerGetAnnotationsTool(app);
  registerCreateAnnotationTool(app);
  registerDeleteAnnotationTool(app);
  registerListChartsTool(app);
  registerGetChartTool(app);
  registerSearchUsersTool(app);
  registerGetRevenueTool(app);
  registerListEventTypesTool(app);
  registerGetActiveUsersTool(app);
}
