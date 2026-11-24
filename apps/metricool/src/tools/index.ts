import type { AgentApp } from '@agentapps/sdk';
import { registerCreateDraftTool } from './create-draft.js';
import { registerDeletePostTool } from './delete-post.js';
import { registerGetBestTimesTool } from './get-best-times.js';
import { registerGetMetricTimelineTool } from './get-metric-timeline.js';
import { registerGetPostTool } from './get-post.js';
import { registerListBrandsTool } from './list-brands.js';
import { registerListPostsTool } from './list-posts.js';
import { registerListPublishedPostsTool } from './list-published-posts.js';
import { registerSchedulePostTool } from './schedule-post.js';

/** Registers every tool. One file per tool, one line here per tool. */
export function registerTools(app: AgentApp): void {
  registerListBrandsTool(app);
  registerListPostsTool(app);
  registerGetPostTool(app);
  registerGetBestTimesTool(app);
  registerGetMetricTimelineTool(app);
  registerListPublishedPostsTool(app);
  registerCreateDraftTool(app);
  registerSchedulePostTool(app);
  registerDeletePostTool(app);
}
