import type { AgentApp } from '@agentapps/sdk';
import { registerAddCommentTool } from './add-comment.js';
import { registerCreateRecordsTool } from './create-records.js';
import { registerCreateWebhookTool } from './create-webhook.js';
import { registerDeleteRecordsTool } from './delete-records.js';
import { registerGetRecordTool } from './get-record.js';
import { registerListBasesTool } from './list-bases.js';
import { registerListCommentsTool } from './list-comments.js';
import { registerListRecordsTool } from './list-records.js';
import { registerListTablesTool } from './list-tables.js';
import { registerUpdateRecordsTool } from './update-records.js';

export function registerTools(app: AgentApp): void {
  registerListBasesTool(app);
  registerListTablesTool(app);
  registerListRecordsTool(app);
  registerGetRecordTool(app);
  registerCreateRecordsTool(app);
  registerUpdateRecordsTool(app);
  registerDeleteRecordsTool(app);
  registerListCommentsTool(app);
  registerAddCommentTool(app);
  registerCreateWebhookTool(app);
}
