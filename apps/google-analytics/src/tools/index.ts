import type { AgentApp } from '@agentapps/sdk';
import { registerBatchRunReportsTool } from './batch-run-reports.js';
import { registerCreateDataStreamTool } from './create-data-stream.js';
import { registerCreatePropertyTool } from './create-property.js';
import { registerDeletePropertyTool } from './delete-property.js';
import { registerGetDataStreamTool } from './get-data-stream.js';
import { registerGetMetadataTool } from './get-metadata.js';
import { registerGetPropertyTool } from './get-property.js';
import { registerListAccountsTool } from './list-accounts.js';
import { registerListDataStreamsTool } from './list-data-streams.js';
import { registerListPropertiesTool } from './list-properties.js';
import { registerRunRealtimeReportTool } from './run-realtime-report.js';
import { registerRunReportTool } from './run-report.js';
import { registerUpdatePropertyTool } from './update-property.js';

export function registerTools(app: AgentApp): void {
  registerListAccountsTool(app);
  registerListPropertiesTool(app);
  registerGetPropertyTool(app);
  registerListDataStreamsTool(app);
  registerGetDataStreamTool(app);
  registerRunReportTool(app);
  registerBatchRunReportsTool(app);
  registerRunRealtimeReportTool(app);
  registerGetMetadataTool(app);
  registerCreatePropertyTool(app);
  registerUpdatePropertyTool(app);
  registerDeletePropertyTool(app);
  registerCreateDataStreamTool(app);
}
