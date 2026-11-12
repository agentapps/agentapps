import type { AgentApp } from '@agentapps/sdk';
import { registerCreateDnsRecordTool } from './create-dns-record.js';
import { registerDeleteDnsRecordTool } from './delete-dns-record.js';
import { registerGetWorkerTool } from './get-worker.js';
import { registerGetZoneTool } from './get-zone.js';
import { registerGetZoneAnalyticsTool } from './get-zone-analytics.js';
import { registerListDnsRecordsTool } from './list-dns-records.js';
import { registerListFirewallRulesTool } from './list-firewall-rules.js';
import { registerListKvNamespacesTool } from './list-kv-namespaces.js';
import { registerListPageRulesTool } from './list-page-rules.js';
import { registerListWorkersTool } from './list-workers.js';
import { registerListZonesTool } from './list-zones.js';
import { registerPurgeCacheTool } from './purge-cache.js';
import { registerUpdateDnsRecordTool } from './update-dns-record.js';

export function registerTools(app: AgentApp): void {
  registerListZonesTool(app);
  registerGetZoneTool(app);
  registerListDnsRecordsTool(app);
  registerCreateDnsRecordTool(app);
  registerUpdateDnsRecordTool(app);
  registerDeleteDnsRecordTool(app);
  registerPurgeCacheTool(app);
  registerListWorkersTool(app);
  registerGetWorkerTool(app);
  registerListKvNamespacesTool(app);
  registerListPageRulesTool(app);
  registerGetZoneAnalyticsTool(app);
  registerListFirewallRulesTool(app);
}
