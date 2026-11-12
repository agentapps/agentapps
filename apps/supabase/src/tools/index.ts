import type { AgentApp } from '@agentapps/sdk';
import { registerCreateBucketTool } from './create-bucket.js';
import { registerDeleteRowsTool } from './delete-rows.js';
import { registerGetPublicUrlTool } from './get-public-url.js';
import { registerGetRowTool } from './get-row.js';
import { registerInsertRowsTool } from './insert-rows.js';
import { registerListBucketsTool } from './list-buckets.js';
import { registerListFilesTool } from './list-files.js';
import { registerListTablesTool } from './list-tables.js';
import { registerListUsersTool } from './list-users.js';
import { registerQueryTableTool } from './query-table.js';
import { registerRpcTool } from './rpc.js';
import { registerUpdateRowsTool } from './update-rows.js';

export function registerTools(app: AgentApp): void {
  registerQueryTableTool(app);
  registerGetRowTool(app);
  registerInsertRowsTool(app);
  registerUpdateRowsTool(app);
  registerDeleteRowsTool(app);
  registerListTablesTool(app);
  registerRpcTool(app);
  registerListBucketsTool(app);
  registerCreateBucketTool(app);
  registerListFilesTool(app);
  registerGetPublicUrlTool(app);
  registerListUsersTool(app);
}
