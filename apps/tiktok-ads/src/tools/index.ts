import type { AgentApp } from '@agentapps/sdk';
import { registerEnableDeliveryTool } from './enable-delivery.js';
import { registerGetAdvertiserInfoTool } from './get-advertiser-info.js';
import { registerGetReportTool } from './get-report.js';
import { registerListAdGroupsTool } from './list-ad-groups.js';
import { registerListAdsTool } from './list-ads.js';
import { registerListAdvertisersTool } from './list-advertisers.js';
import { registerListCampaignsTool } from './list-campaigns.js';
import { registerPauseDeliveryTool } from './pause-delivery.js';
import { registerUpdateBudgetTool } from './update-budget.js';

/** Registers every tool. One file per tool, one line here per tool. */
export function registerTools(app: AgentApp): void {
  registerListAdvertisersTool(app);
  registerGetAdvertiserInfoTool(app);
  registerListCampaignsTool(app);
  registerListAdGroupsTool(app);
  registerListAdsTool(app);
  registerGetReportTool(app);
  registerPauseDeliveryTool(app);
  registerEnableDeliveryTool(app);
  registerUpdateBudgetTool(app);
}
